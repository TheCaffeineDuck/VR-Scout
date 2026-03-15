"""WebSocket message models matching client/src/types/ws.ts."""

from typing import Literal, Union

from pydantic import BaseModel

from .pipeline import StatusFile


class TrainingMetric(BaseModel):
    """Matches TypeScript TrainingMetric interface exactly."""

    iteration: int
    max_iterations: int
    loss: float
    psnr: float
    gaussian_count: int
    elapsed_seconds: float
    eta_seconds: float


class LogLineData(BaseModel):
    step: int
    line: str


class WarningData(BaseModel):
    message: str


class GpuData(BaseModel):
    memory_used_mb: float
    memory_total_mb: float
    utilization_pct: float


class WSStatusMessage(BaseModel):
    type: Literal["status"] = "status"
    data: StatusFile


class WSMetricMessage(BaseModel):
    type: Literal["metric"] = "metric"
    data: TrainingMetric


class WSLogLineMessage(BaseModel):
    type: Literal["log_line"] = "log_line"
    data: LogLineData


class WSWarningMessage(BaseModel):
    type: Literal["warning"] = "warning"
    data: WarningData


class WSGpuMessage(BaseModel):
    type: Literal["gpu"] = "gpu"
    data: GpuData


WSMessage = Union[
    WSStatusMessage,
    WSMetricMessage,
    WSLogLineMessage,
    WSWarningMessage,
    WSGpuMessage,
]
