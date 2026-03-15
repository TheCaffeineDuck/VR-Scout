"""Security utilities: path sanitization, input validation, rate limiting."""

import re
import time
from collections import defaultdict
from pathlib import Path

from fastapi import HTTPException

# Scene ID pattern: alphanumeric, hyphens, underscores only, max 64 chars
SCENE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def validate_scene_id(scene_id: str) -> str:
    """Validate a scene_id is safe for use as a directory name.

    - Alphanumeric + hyphens + underscores only
    - Max 64 characters
    - No path traversal characters

    Returns the scene_id if valid, raises HTTPException(422) otherwise.
    """
    if not SCENE_ID_PATTERN.match(scene_id):
        raise HTTPException(
            status_code=422,
            detail=(
                "Invalid scene_id: must be 1-64 characters, "
                "alphanumeric, hyphens, or underscores only"
            ),
        )
    return scene_id


def sanitize_path(base_dir: Path, user_input: str) -> Path:
    """Resolve a user-provided path component safely within base_dir.

    - Strips null bytes, .., /, \\ from user_input
    - Resolves to absolute path
    - Verifies the resolved path starts with base_dir
    - Raises HTTPException(403) if path escapes base_dir

    Returns the resolved absolute Path.
    """
    # Strip dangerous characters
    cleaned = user_input.replace("\x00", "").replace("..", "").replace("/", "").replace("\\", "")

    if not cleaned:
        raise HTTPException(status_code=403, detail="Invalid path")

    resolved_base = base_dir.resolve()
    resolved_path = (base_dir / cleaned).resolve()

    if not str(resolved_path).startswith(str(resolved_base)):
        raise HTTPException(status_code=403, detail="Path traversal detected")

    return resolved_path


class SlidingWindowRateLimiter:
    """Simple in-memory sliding window rate limiter.

    Tracks request timestamps per key (e.g., IP or client ID).
    No external dependencies.
    """

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._timestamps: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        """Check if a request is allowed and record it if so.

        Returns True if within the rate limit, False otherwise.
        """
        now = time.monotonic()
        cutoff = now - self.window_seconds

        # Prune expired timestamps
        timestamps = self._timestamps[key]
        self._timestamps[key] = [t for t in timestamps if t > cutoff]

        if len(self._timestamps[key]) >= self.max_requests:
            return False

        self._timestamps[key].append(now)
        return True

    def check_or_raise(self, key: str) -> None:
        """Check rate limit and raise HTTPException(429) if exceeded."""
        if not self.is_allowed(key):
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded. Please try again later.",
            )


# Pre-configured rate limiters
upload_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=60.0)
pipeline_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=60.0)
general_limiter = SlidingWindowRateLimiter(max_requests=60, window_seconds=60.0)
