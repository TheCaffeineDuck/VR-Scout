"""Scene-related Pydantic models matching client/src/types/scene.ts."""

import re
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SceneConfig(BaseModel):
    """Matches TypeScript SceneConfig interface exactly."""

    id: str
    name: str
    spzUrl: str
    alignmentUrl: str
    gaussianCount: int
    shDegree: Literal[0, 1, 2, 3]
    coordinateSystem: Literal["rub"] = "rub"
    maxStdDev: Optional[float] = None
    lodEnabled: Optional[bool] = None
    mobileBudget: Optional[int] = None


class SceneRow(BaseModel):
    """Database row representation for a scene."""

    id: str
    name: str
    created_at: str
    updated_at: str
    config: Optional[SceneConfig] = None
    latest_run_id: Optional[str] = None
    pipeline_status: Optional[str] = None


class SceneCreate(BaseModel):
    """Request body for creating a scene."""

    id: Annotated[str, Field(max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]
    name: Annotated[str, Field(min_length=1, max_length=200)]

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_-]{1,64}$", v):
            raise ValueError(
                "id must be 1-64 characters, alphanumeric, hyphens, or underscores only"
            )
        return v


class AlignmentUpdate(BaseModel):
    """Request body for updating scene alignment."""

    alignment: dict  # type: ignore[type-arg]
