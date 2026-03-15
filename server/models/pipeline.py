"""Pipeline-related Pydantic models matching client/src/types/pipeline.ts."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, model_serializer


PipelineStatus = Literal[
    "running",
    "completed",
    "failed",
    "warning",
    "blocked",
    "awaiting_confirmation",
    "awaiting_review",
]


class StatusFile(BaseModel):
    """Matches TypeScript StatusFile interface exactly."""

    scene_id: str
    current_step: int
    step_name: str
    status: PipelineStatus
    message: str
    timestamp: str
    pid: int


class PipelineConfig(BaseModel):
    """Matches TypeScript PipelineConfig interface exactly."""

    camera_model: Literal["SIMPLE_RADIAL", "OPENCV"]
    matcher: Literal["exhaustive", "sequential"]
    training_iterations: int
    sh_degree: Literal[0, 1, 2, 3]
    data_factor: Literal[1, 2, 4]
    frame_fps: Literal[1, 2, 3]
    scene_change_threshold: float


class ValidationReport(BaseModel):
    """Matches TypeScript ValidationReport interface exactly."""

    registration_rate: float
    registered_images: int
    total_images: int
    mean_reprojection_error_px: float
    point_count: int
    camera_model: str
    alignment_applied: bool
    alignment_is_identity: bool
    unregistered_images: list[str]
    warnings: list[str]

    # 'pass' is a Python keyword, use alias
    pass_: bool

    model_config = {"populate_by_name": True}

    @model_serializer
    def _serialize(self) -> dict[str, Any]:
        """Serialize pass_ as 'pass' to match TypeScript interface."""
        data: dict[str, Any] = {
            "registration_rate": self.registration_rate,
            "registered_images": self.registered_images,
            "total_images": self.total_images,
            "mean_reprojection_error_px": self.mean_reprojection_error_px,
            "point_count": self.point_count,
            "camera_model": self.camera_model,
            "alignment_applied": self.alignment_applied,
            "alignment_is_identity": self.alignment_is_identity,
            "unregistered_images": self.unregistered_images,
            "warnings": self.warnings,
            "pass": self.pass_,
        }
        return data


class PipelineRunRow(BaseModel):
    """Database row representation for a pipeline run."""

    id: str
    scene_id: str
    config: PipelineConfig
    status: str = "pending"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    validation_report: Optional[ValidationReport] = None


class PipelineStepRow(BaseModel):
    """Database row representation for a pipeline step."""

    id: Optional[int] = None
    run_id: str
    step_number: int
    step_name: str
    status: str = "pending"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    message: Optional[str] = None
    log_path: Optional[str] = None
