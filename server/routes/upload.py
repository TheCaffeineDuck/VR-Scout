"""Chunked file upload endpoint with ffprobe validation, plus SRT sidecar upload."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from ..config import settings
from ..db import get_scene
from ..security import sanitize_path, upload_limiter, validate_scene_id
from ..utils.metadata_extractor import parse_dji_srt

router = APIRouter()
logger = logging.getLogger(__name__)

# Track total uploaded bytes per scene_id (in-memory; resets on server restart)
_upload_totals: dict[str, int] = {}


async def _probe_video(file_path: Path) -> Optional[dict[str, object]]:
    """Validate video file with ffprobe and return metadata.

    Uses asyncio.create_subprocess_exec (NEVER shell=True).
    Returns None if ffprobe is not available.
    """
    try:
        process = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(file_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=30.0
        )
    except FileNotFoundError:
        logger.info("ffprobe not found, skipping video validation")
        return None
    except TimeoutError:
        logger.warning("ffprobe timed out for %s", file_path)
        return None

    if process.returncode != 0:
        logger.warning(
            "ffprobe failed for %s (exit %d): %s",
            file_path, process.returncode,
            stderr.decode(errors="replace").strip(),
        )
        return None

    try:
        data = json.loads(stdout.decode(errors="replace"))
    except json.JSONDecodeError:
        logger.warning("ffprobe output is not valid JSON for %s", file_path)
        return None

    # Extract useful metadata
    fmt = data.get("format", {})
    streams = data.get("streams", [])

    video_stream = next(
        (s for s in streams if s.get("codec_type") == "video"), None
    )

    metadata: dict[str, object] = {
        "format": fmt.get("format_name"),
        "duration_seconds": float(fmt["duration"]) if "duration" in fmt else None,
        "size_bytes": int(fmt["size"]) if "size" in fmt else None,
    }

    if video_stream:
        metadata["video_codec"] = video_stream.get("codec_name")
        metadata["width"] = video_stream.get("width")
        metadata["height"] = video_stream.get("height")
        r_frame_rate = video_stream.get("r_frame_rate", "")
        if "/" in str(r_frame_rate):
            parts = str(r_frame_rate).split("/")
            try:
                num, den = int(parts[0]), int(parts[1])
                metadata["fps"] = round(num / den, 2) if den else None
            except (ValueError, ZeroDivisionError):
                metadata["fps"] = None
        else:
            try:
                metadata["fps"] = float(r_frame_rate) if r_frame_rate else None
            except ValueError:
                metadata["fps"] = None

    return metadata


@router.post("/api/upload/chunk")
async def upload_chunk(
    request: Request,
    scene_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Handle chunked file upload.

    Receives one chunk at a time. When all chunks are received,
    reassembles them into raw/{scene_id}.mp4 and validates with ffprobe.
    """
    # Input validation
    validate_scene_id(scene_id)

    if chunk_index < 0:
        raise HTTPException(status_code=400, detail="chunk_index must be non-negative")
    if total_chunks < 1 or total_chunks > 10000:
        raise HTTPException(
            status_code=400,
            detail="total_chunks must be between 1 and 10000",
        )
    if chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="chunk_index must be less than total_chunks")

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    upload_limiter.check_or_raise(client_ip)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    # Read chunk content and enforce chunk size limit
    content = await file.read()
    if len(content) > settings.max_chunk_size:
        raise HTTPException(
            status_code=413,
            detail=f"Chunk exceeds maximum size of {settings.max_chunk_size} bytes",
        )

    # Track total upload size per scene
    current_total = _upload_totals.get(scene_id, 0) + len(content)
    if current_total > settings.max_total_upload_size:
        raise HTTPException(
            status_code=413,
            detail=f"Total upload size for scene exceeds {settings.max_total_upload_size} bytes",
        )
    _upload_totals[scene_id] = current_total

    # Ensure directories exist
    # Save to scenes/{scene_id}/raw/ (keeps all scene data co-located)
    raw_dir = sanitize_path(settings.scenes_path, scene_id) / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir = sanitize_path(settings.scenes_path, scene_id) / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    # Write chunk to temp file
    chunk_path = chunks_dir / f"chunk_{chunk_index:05d}"
    chunk_path.write_bytes(content)

    # Check if all chunks are present
    received = len(list(chunks_dir.glob("chunk_*")))
    if received == total_chunks:
        # Reassemble into project-root raw/{scene_id}.mp4
        output_path = raw_dir / f"{scene_id}.mp4"
        with open(output_path, "wb") as out:
            for i in range(total_chunks):
                cp = chunks_dir / f"chunk_{i:05d}"
                if not cp.exists():
                    raise HTTPException(
                        status_code=500,
                        detail=f"Missing chunk {i} during reassembly",
                    )
                out.write(cp.read_bytes())

        # Clean up chunks
        for cp in chunks_dir.glob("chunk_*"):
            cp.unlink()
        chunks_dir.rmdir()

        # Reset upload tracking for this scene
        _upload_totals.pop(scene_id, None)

        # Validate with ffprobe (if available)
        video_metadata = await _probe_video(output_path)

        result: dict[str, object] = {
            "status": "complete",
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "file_path": str(output_path),
            "file_size_bytes": output_path.stat().st_size,
        }

        if video_metadata is not None:
            result["video_metadata"] = video_metadata

        return result

    return {
        "status": "partial",
        "chunk_index": chunk_index,
        "total_chunks": total_chunks,
        "received": received,
    }


_SRT_MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/api/upload/srt/{scene_id}")
async def upload_srt(
    scene_id: str,
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Upload an optional DJI SRT sidecar file for a scene.

    Validation:
    - Scene must exist
    - File extension must be .srt or .SRT
    - File size must be < 10MB
    - File must parse as valid SRT (numbered blocks with timecodes)

    Stores to: scenes/{scene_id}/source.srt
    Returns parse summary with entry count and data availability flags.
    """
    validate_scene_id(scene_id)

    client_ip = request.client.host if request.client else "unknown"
    upload_limiter.check_or_raise(client_ip)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    # Validate file extension
    filename = file.filename or ""
    if not filename.lower().endswith(".srt"):
        raise HTTPException(
            status_code=422,
            detail="File must have .srt extension",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > _SRT_MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"SRT file exceeds maximum size of {_SRT_MAX_SIZE // (1024 * 1024)} MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=422, detail="SRT file is empty")

    # Save to scene directory
    scene_dir = sanitize_path(settings.scenes_path, scene_id)
    scene_dir.mkdir(parents=True, exist_ok=True)
    srt_path = scene_dir / "source.srt"
    srt_path.write_bytes(content)

    # Parse to validate and return summary
    try:
        srt_data = parse_dji_srt(str(srt_path))
    except Exception as exc:
        # Remove invalid file
        srt_path.unlink(missing_ok=True)
        logger.warning("SRT parse failed for scene %s: %s", scene_id, exc)
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse SRT file: {exc}",
        ) from exc

    if srt_data["entry_count"] == 0:
        srt_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="SRT file contains no valid subtitle entries",
        )

    return {
        "status": "ok",
        "entry_count": srt_data["entry_count"],
        "has_gps": srt_data["has_gps"],
        "has_gimbal": srt_data["has_gimbal"],
        "has_altitude": srt_data.get("has_altitude", False),
        "fps_estimate": srt_data.get("fps_estimate"),
        "gimbal_range": srt_data.get("gimbal_range"),
    }


@router.delete("/api/upload/srt/{scene_id}")
async def delete_srt(
    scene_id: str,
    request: Request,
) -> dict[str, str]:
    """Delete the SRT sidecar file for a scene."""
    validate_scene_id(scene_id)

    client_ip = request.client.host if request.client else "unknown"
    upload_limiter.check_or_raise(client_ip)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    srt_path = sanitize_path(settings.scenes_path, scene_id) / "source.srt"
    if not srt_path.exists():
        raise HTTPException(status_code=404, detail="No SRT file found for this scene")

    srt_path.unlink()
    return {"status": "deleted"}
