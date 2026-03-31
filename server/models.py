"""Pydantic models for VR Scout v4."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class StepStatusEnum(str, enum.Enum):
    """Possible statuses for a pipeline step."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    WARNING = "warning"
    BLOCKED = "blocked"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    AWAITING_REVIEW = "awaiting_review"
    SKIPPED = "skipped"


class ProfileEnum(str, enum.Enum):
    """Hardware profile classification."""

    FULL = "full"
    STANDARD = "standard"
    CONSTRAINED = "constrained"
    UNKNOWN = "unknown"


class GaussianCount(BaseModel):
    """Gaussian splat budgets per platform."""

    desktop: int = 800_000
    quest: int = 500_000


class SceneConfig(BaseModel):
    """Full scene configuration with asset URLs and rendering parameters."""

    id: str
    name: str
    desktop_spz_url: str = ""
    quest_spz_url: str = ""
    alignment_url: str = ""
    collision_mesh_url: str | None = None
    environment_map_url: str | None = None
    flythrough_video_url: str | None = None
    gaussian_count: GaussianCount = GaussianCount()
    sh_degree: Literal[0, 1, 2, 3] = 1
    coordinate_system: Literal["rub"] = "rub"
    max_std_dev: float | None = None
    scale_metric: bool | None = None
    scale_meters_per_unit: float | None = None


class SceneStatus(BaseModel):
    """Current processing status of a scene."""

    scene_id: str
    status: StepStatusEnum = StepStatusEnum.PENDING
    current_step: int | None = None
    current_step_name: str | None = None
    message: str | None = None


class SceneRun(BaseModel):
    """Record of a pipeline run for a scene."""

    id: str
    scene_id: str
    config_json: str = ""
    started_at: datetime | None = None
    completed_at: datetime | None = None
    status: StepStatusEnum = StepStatusEnum.PENDING


class SceneCreate(BaseModel):
    """Request body for creating a new scene."""

    name: str


class PipelineConfig(BaseModel):
    """Configuration for a pipeline run."""

    camera_model: Literal["SIMPLE_RADIAL", "OPENCV"] = "SIMPLE_RADIAL"
    matcher: Literal["exhaustive", "sequential", "spatial"] = "exhaustive"
    training_iterations: int = 30_000
    sh_degree: Literal[0, 1, 2, 3] = 1
    data_factor: Literal[1, 2, 4] = 1
    frame_fps: Literal[1, 2, 3] = 2
    scene_change_threshold: float = 0.02
    depth_estimation: bool = True
    depth_model_size: Literal["Small", "Base", "Large"] = "Base"
    segmentation: Literal["on", "off", "auto"] = "auto"
    perceptual_pruning: bool = True
    quest_gaussian_budget: int = 500_000
    desktop_gaussian_budget: int = 800_000


class StepStatus(BaseModel):
    """Status update for a single pipeline step."""

    step_num: int
    step_name: str
    status: StepStatusEnum = StepStatusEnum.PENDING
    message: str | None = None
    timestamp: datetime | None = None
    pid: int | None = None


class StepResult(BaseModel):
    """Result returned after a pipeline step completes."""

    exit_code: int = 0
    message: str = ""
    duration_seconds: float = 0.0


class TrainingMetric(BaseModel):
    """Real-time training metrics emitted during gaussian splatting."""

    iteration: int
    max_iterations: int
    loss: float
    depth_loss: float | None = None
    psnr: float
    gaussian_count: int
    elapsed_seconds: float
    eta_seconds: float


class ValidationReport(BaseModel):
    """SfM validation results after mapping."""

    registration_rate: float = 0.0
    reprojection_error: float = 0.0
    point_count: int = 0
    camera_model: str = ""
    image_count: int = 0
    alignment_status: str = ""


class GPSCoordinate(BaseModel):
    """GPS position with optional altitude."""

    latitude: float
    longitude: float
    altitude: float | None = None


class FrameMetadata(BaseModel):
    """Per-frame sensor and camera metadata."""

    frame_index: int = 0
    timestamp_ms: float = 0.0
    quaternion: list[float] | None = None
    gravity_vector: list[float] | None = None
    accelerometer: list[float] | None = None
    gps: GPSCoordinate | None = None
    iso: int | None = None
    shutter_speed: str | None = None
    white_balance: int | None = None


class MetadataResult(BaseModel):
    """Aggregated metadata extraction result."""

    source: str = ""
    device: str = ""
    frames: list[FrameMetadata] = []
    has_gravity: bool = False
    has_gps: bool = False
    has_orientation: bool = False
    has_metric_scale: bool = False


class HardwareDefaults(BaseModel):
    """Default pipeline settings derived from hardware capabilities."""

    data_factor: int = 1
    max_steps: int = 30_000
    depth_model: str = "Base"
    segmentation_enabled: bool = True
    perceptual_pruning_enabled: bool = True


class HardwareProfile(BaseModel):
    """Detected GPU and CUDA environment profile."""

    gpu_name: str = ""
    gpu_vram_gb: float = 0.0
    compute_capability: str = ""
    sm_architecture: int = 0
    cuda_toolkit_version: str = ""
    cuda_home: str = ""
    pytorch_cuda_version: str = ""
    profile: ProfileEnum = ProfileEnum.UNKNOWN
    defaults: HardwareDefaults = HardwareDefaults()
    detected_at: datetime | None = None


# -- WebSocket message types --


class WSStatusMessage(BaseModel):
    """WebSocket message carrying a step status update."""

    type: Literal["status"] = "status"
    data: StepStatus


class WSMetricMessage(BaseModel):
    """WebSocket message carrying a training metric."""

    type: Literal["metric"] = "metric"
    data: TrainingMetric


class WSLogLineMessage(BaseModel):
    """WebSocket message carrying a log line."""

    type: Literal["log_line"] = "log_line"
    data: dict[str, object]


class WSWarningMessage(BaseModel):
    """WebSocket message carrying a warning."""

    type: Literal["warning"] = "warning"
    data: dict[str, str]


class WSGPUMessage(BaseModel):
    """WebSocket message carrying GPU utilization data."""

    type: Literal["gpu"] = "gpu"
    data: dict[str, float]


class WSDepthProgressMessage(BaseModel):
    """WebSocket message carrying depth estimation progress."""

    type: Literal["depth_progress"] = "depth_progress"
    data: dict[str, int]


class WSPruningProgressMessage(BaseModel):
    """WebSocket message carrying gaussian pruning progress."""

    type: Literal["pruning_progress"] = "pruning_progress"
    data: dict[str, int]


class WSVideoProgressMessage(BaseModel):
    """WebSocket message carrying video render progress."""

    type: Literal["video_progress"] = "video_progress"
    data: dict[str, int]


WSMessage = (
    WSStatusMessage
    | WSMetricMessage
    | WSLogLineMessage
    | WSWarningMessage
    | WSGPUMessage
    | WSDepthProgressMessage
    | WSPruningProgressMessage
    | WSVideoProgressMessage
)
