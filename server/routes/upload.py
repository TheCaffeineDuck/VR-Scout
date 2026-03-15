"""Chunked file upload endpoint."""

from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..config import settings
from ..db import get_scene

router = APIRouter()


@router.post("/api/upload/chunk")
async def upload_chunk(
    scene_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Handle chunked file upload.

    Receives one chunk at a time (5MB each). When all chunks are received,
    reassembles them into raw/{scene_id}.mp4.
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

        return {
            "status": "complete",
            "chunk_index": chunk_index,
            "total_chunks": total_chunks,
            "file_path": str(output_path),
        }

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
