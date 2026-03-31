"""Abstract base class for pipeline steps."""

from __future__ import annotations

import abc

from server.models import PipelineConfig, StepResult, StepStatusEnum


class StepBase(abc.ABC):
    """Base class that all pipeline steps must inherit from."""

    step_num: int = 0
    step_name: str = ""

    @abc.abstractmethod
    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Execute the step logic and return a result."""
        ...

    async def update_status(
        self,
        scene_id: str,
        status: StepStatusEnum,
        message: str = "",
    ) -> None:
        """Persist the current step status to the database."""
        pass

    async def write_log(self, scene_id: str, line: str) -> None:
        """Append a line to the step log file."""
        pass

    async def push_websocket(self, scene_id: str, payload: object) -> None:
        """Send a real-time update over the WebSocket connection."""
        pass
