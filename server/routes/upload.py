"""Chunked file upload endpoint with ffprobe validation."""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..config import settings
from ..db import get_scene

router = APIRouter()
logger = logging.getLogger(__name__)


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
    scene_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Handle chunked file upload.

    Receives one chunk at a time (5MB each). When all chunks are received,
    reassembles them into raw/{scene_id}.mp4 and validates with ffprobe.
    """
    _validate_scene_id(scene_id)

    scene = await get_scene(scene_id)
    if scene is None:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")

    if chunk_index < 0 or chunk_index >= total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk_index")

    # Ensure directories exist
    scene_dir = settings.scenes_path / scene_id
    raw_dir = scene_dir / "raw"
    chunks_dir = scene_dir / "chunks"
    raw_dir.mkdir(parents=True, exist_ok=True)
    chunks_dir.mkdir(parents=True, exist_ok=True)

    # Write chunk to temp file
    chunk_path = chunks_dir / f"chunk_{chunk_index:05d}"
    content = await file.read()
    if len(content) > settings.upload_chunk_size + 1024:  # Allow small overhead
        raise HTTPException(status_code=413, detail="Chunk too large")

    chunk_path.write_bytes(content)

    # Check if all chunks are present
    received = len(list(chunks_dir.glob("chunk_*")))
    if received == total_chunks:
        # Reassemble
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


def _validate_scene_id(scene_id: str) -> None:
    """Validate scene_id to prevent path traversal attacks."""
    normalized = Path(scene_id).name
    if normalized != scene_id or ".." in scene_id or "/" in scene_id or "\\" in scene_id:
        raise HTTPException(status_code=400, detail="Invalid scene ID")
