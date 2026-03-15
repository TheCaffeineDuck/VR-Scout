"""Scene-related Pydantic models matching client/src/types/scene.ts."""

from typing import Literal, Optional

from pydantic import BaseModel


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


class SceneCreate(BaseModel):
    """Request body for creating a scene."""

    id: str
    name: str


class AlignmentUpdate(BaseModel):
    """Request body for updating scene alignment."""

    alignment: dict  # type: ignore[type-arg]
