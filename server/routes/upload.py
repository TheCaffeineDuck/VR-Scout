"""Upload routes for chunked video and supplementary file ingestion."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, UploadFile

from server.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upload", tags=["upload"])


@router.post("/chunk")
async def upload_chunk(
    file: UploadFile,
    x_scene_id: str = Header(...),
    x_chunk_index: int = Header(...),
    x_total_chunks: int = Header(...),
    x_filename: str = Header(...),
) -> dict[str, str]:
    """Receive a single chunk of a large video upload.

    CRITICAL: Chunks are named with zero-padded indices AND reassembled
    with integer sort key to prevent the v3 lexicographic sort bug
    (chunk_10 sorted before chunk_2).
    """
    scene_dir = settings.scenes_path / x_scene_id
    chunks_dir = scene_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    # Save chunk with zero-padded index
    chunk_path = chunks_dir / f"chunk_{x_chunk_index:06d}"
    content = await file.read()
    chunk_path.write_bytes(content)

    logger.info(
        "Received chunk %d/%d for scene %s (%d bytes)",
        x_chunk_index + 1, x_total_chunks, x_scene_id, len(content),
    )

    # Check if all chunks received
    existing_chunks = list(chunks_dir.glob("chunk_*"))
    if len(existing_chunks) >= x_total_chunks:
        # Reassemble — CRITICAL: sort by integer index, not string
        raw_dir = scene_dir / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        output_path = raw_dir / x_filename

        sorted_chunks = sorted(
            existing_chunks,
            key=lambda p: int(p.name.split("_")[1]),
        )

        with open(output_path, "wb") as out:
            for chunk_file in sorted_chunks:
                out.write(chunk_file.read_bytes())

        logger.info(
            "Reassembled %d chunks into %s (%d bytes)",
            len(sorted_chunks), output_path.name, output_path.stat().st_size,
        )

        # Validate with ffprobe
        valid = await _validate_video(output_path)
        if not valid:
            logger.warning("ffprobe validation failed for %s", output_path.name)

        # Clean up chunks
        for chunk_file in sorted_chunks:
            chunk_file.unlink(missing_ok=True)
        try:
            chunks_dir.rmdir()
        except OSError:
            pass

        return {"status": "complete", "scene_id": x_scene_id, "filename": x_filename}

    return {
        "status": "partial",
        "scene_id": x_scene_id,
        "received": str(len(existing_chunks)),
        "total": str(x_total_chunks),
    }


@router.post("/supplementary/{scene_id}")
async def upload_supplementary(
    scene_id: str,
    file: UploadFile,
) -> dict[str, str]:
    """Upload a supplementary file (SRT, panorama, etc.) for a scene."""
    scene_dir = settings.scenes_path / scene_id
    if not scene_dir.exists():
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()

    if ext in {".srt"}:
        dest_dir = scene_dir / "supplementary"
    elif ext in {".jpg", ".jpeg", ".png", ".tiff", ".tif"}:
        dest_dir = scene_dir / "panoramas"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Accepted: .srt, .jpg, .jpeg, .png",
        )

    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename

    content = await file.read()
    dest_path.write_bytes(content)

    return {"status": "uploaded", "path": str(dest_path.relative_to(scene_dir))}


async def _validate_video(path: Path) -> bool:
    """Run ffprobe to verify the file is a valid video."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, _ = await proc.communicate()
        if proc.returncode != 0:
            return False

        import json

        data = json.loads(stdout_bytes.decode("utf-8", errors="replace"))
        streams = data.get("streams", [])
        return any(s.get("codec_type") == "video" for s in streams)
    except Exception:
        return False
