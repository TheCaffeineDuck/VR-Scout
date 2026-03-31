"""Abstract base class for pipeline steps."""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import TYPE_CHECKING

from server.config import settings
from server.models import PipelineConfig, StepResult, StepStatusEnum

if TYPE_CHECKING:
    from server.pipeline.orchestrator import PipelineOrchestrator
    from server.ws.handler import ConnectionManager

logger = logging.getLogger(__name__)


class StepBase(abc.ABC):
    """Base class that all pipeline steps must inherit from."""

    step_num: int = 0
    step_name: str = ""

    # Injected by orchestrator before run()
    _run_id: str = ""
    _ws_manager: ConnectionManager | None = None
    _start_time: float = 0.0
    _orchestrator: PipelineOrchestrator | None = None

    @abc.abstractmethod
    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Execute the step logic and return a result."""
        ...

    def get_scene_dir(self, scene_id: str) -> Path:
        """Return the scene directory path."""
        return settings.scenes_path / scene_id

    def get_log_path(self, scene_id: str) -> Path:
        """Return the log file path for this step."""
        log_dir = self.get_scene_dir(scene_id) / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir / f"step_{self.step_num:02d}_{self.step_name}.log"

    @property
    def elapsed_time(self) -> float:
        """Seconds elapsed since step started."""
        if self._start_time == 0.0:
            return 0.0
        return time.monotonic() - self._start_time

    async def update_status(
        self,
        scene_id: str,
        status: StepStatusEnum,
        message: str = "",
    ) -> None:
        """Persist the current step status to the database and broadcast via WS."""
        from server.database import update_step_status

        await update_step_status(
            self._run_id, self.step_num, self.step_name, status.value, message,
        )
        if self._ws_manager:
            await self._ws_manager.broadcast_json(scene_id, {
                "type": "status",
                "data": {
                    "step_num": self.step_num,
                    "step_name": self.step_name,
                    "status": status.value,
                    "message": message,
                },
            })

    async def write_log(self, scene_id: str, line: str) -> None:
        """Append a line to the step log file and push over WebSocket."""
        log_path = self.get_log_path(scene_id)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if self._ws_manager:
            await self._ws_manager.broadcast_json(scene_id, {
                "type": "log_line",
                "data": {
                    "step_num": self.step_num,
                    "step_name": self.step_name,
                    "line": line,
                },
            })

    async def push_websocket(self, scene_id: str, payload: object) -> None:
        """Send a real-time update over the WebSocket connection."""
        if self._ws_manager:
            await self._ws_manager.broadcast(
                scene_id,
                json.dumps(payload, default=str),
            )

    async def run_subprocess(
        self,
        scene_id: str,
        cmd: list[str],
        cwd: str | Path | None = None,
        env: dict[str, str] | None = None,
        timeout: float | None = None,
    ) -> StepResult:
        """Run a subprocess, streaming output to log and WebSocket in real-time.

        CRITICAL: Uses create_subprocess_exec, NEVER create_subprocess_shell.
        cmd MUST be a list[str], NEVER a single string.
        """
        cmd_str = " ".join(cmd)
        await self.write_log(scene_id, f"$ {cmd_str}")

        merged_env = os.environ.copy()
        if env:
            merged_env.update(env)

        cwd_str = str(cwd) if cwd else None

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd_str,
            env=merged_env,
        )

        # Register with orchestrator for cancellation support
        if self._orchestrator:
            self._orchestrator.register_process(scene_id, proc)

        stderr_lines: list[str] = []

        async def _read_stream(
            stream: asyncio.StreamReader | None,
            prefix: str,
        ) -> None:
            if stream is None:
                return
            while True:
                line_bytes = await stream.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace").rstrip()
                if prefix == "ERR":
                    stderr_lines.append(line)
                await self.write_log(scene_id, f"[{prefix}] {line}")

        try:
            if timeout:
                await asyncio.wait_for(
                    asyncio.gather(
                        _read_stream(proc.stdout, "OUT"),
                        _read_stream(proc.stderr, "ERR"),
                        proc.wait(),
                    ),
                    timeout=timeout,
                )
            else:
                await asyncio.gather(
                    _read_stream(proc.stdout, "OUT"),
                    _read_stream(proc.stderr, "ERR"),
                    proc.wait(),
                )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if self._orchestrator:
                self._orchestrator.unregister_process(scene_id)
            return StepResult(
                exit_code=2,
                message=f"Process timed out after {timeout}s: {cmd_str}",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        exit_code = proc.returncode or 0
        if exit_code != 0:
            last_errors = "\n".join(stderr_lines[-5:]) if stderr_lines else "No stderr output"
            return StepResult(
                exit_code=2,
                message=f"Process exited with code {exit_code}: {last_errors}",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message="OK",
            duration_seconds=self.elapsed_time,
        )
