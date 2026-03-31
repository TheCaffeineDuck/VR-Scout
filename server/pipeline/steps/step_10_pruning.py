"""Step 10: Pruning -- reduce gaussian count for target platforms."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from server.config import settings
from server.models import PipelineConfig, StepResult
from server.pipeline.steps.base import StepBase


class PruningStep(StepBase):
    """Perceptually prune gaussians to meet desktop and Quest budgets."""

    step_num: int = 10
    step_name: str = "pruning"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Run pruning to reduce gaussian count."""
        scene_dir = self.get_scene_dir(scene_id)
        output_dir = scene_dir / "output"

        # Check hardware profile — constrained skips pruning
        profile = settings.load_hardware_profile()
        if profile and profile.profile.value == "constrained":
            return StepResult(
                exit_code=0,
                message=(
                    "Skipped: constrained hardware profile. "
                    "SOR pruning will be used in conversion step."
                ),
                duration_seconds=self.elapsed_time,
            )

        # Find input PLY
        input_ply = output_dir / "point_cloud.ply"
        if not input_ply.exists():
            return StepResult(
                exit_code=2,
                message="No point_cloud.ply found. Training must complete first.",
                duration_seconds=self.elapsed_time,
            )

        output_ply = output_dir / "point_cloud_pruned.ply"
        target_count = config.quest_gaussian_budget  # Use tighter Quest budget

        await self.write_log(scene_id, f"Pruning to target: {target_count:,} gaussians")

        # Run helper script
        script_path = Path(settings.project_root) / "scripts" / "run_pruning.py"
        cmd: list[str] = [
            sys.executable, str(script_path),
            "--input_ply", str(input_ply),
            "--output_ply", str(output_ply),
            "--target_count", str(target_count),
        ]

        result = await self._run_with_progress(scene_id, cmd)
        if result.exit_code != 0:
            return result

        if not output_ply.exists():
            return StepResult(
                exit_code=1,
                message="Pruning script completed but no output PLY. Using unpruned model.",
                duration_seconds=self.elapsed_time,
            )

        size_mb = output_ply.stat().st_size / (1024 * 1024)
        return StepResult(
            exit_code=0,
            message=f"Pruning complete. Output: {size_mb:.1f}MB",
            duration_seconds=self.elapsed_time,
        )

    async def _run_with_progress(
        self,
        scene_id: str,
        cmd: list[str],
    ) -> StepResult:
        """Run pruning subprocess and parse progress."""
        import asyncio
        import os

        merged_env = os.environ.copy()
        profile = settings.load_hardware_profile()
        if profile and profile.cuda_home:
            merged_env["CUDA_HOME"] = profile.cuda_home

        await self.write_log(scene_id, f"$ {' '.join(cmd)}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=merged_env,
        )

        if self._orchestrator:
            self._orchestrator.register_process(scene_id, proc)

        re_progress = re.compile(r"PRUNING_PROGRESS:(\d+)/(\d+)")
        stderr_lines: list[str] = []

        async def _read_stderr(stream: asyncio.StreamReader | None) -> None:
            if stream is None:
                return
            while True:
                data = await stream.readline()
                if not data:
                    break
                line = data.decode("utf-8", errors="replace").rstrip()
                stderr_lines.append(line)
                await self.write_log(scene_id, f"[ERR] {line}")

        async def _read_stdout(stream: asyncio.StreamReader | None) -> None:
            if stream is None:
                return
            while True:
                data = await stream.readline()
                if not data:
                    break
                line = data.decode("utf-8", errors="replace").rstrip()
                await self.write_log(scene_id, f"[OUT] {line}")
                m = re_progress.search(line)
                if m:
                    current = int(m.group(1))
                    target = int(m.group(2))
                    await self.push_websocket(scene_id, {
                        "type": "pruning_progress",
                        "data": {"current_count": current, "target_count": target},
                    })

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _read_stdout(proc.stdout),
                    _read_stderr(proc.stderr),
                    proc.wait(),
                ),
                timeout=5400.0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if self._orchestrator:
                self._orchestrator.unregister_process(scene_id)
            return StepResult(
                exit_code=2,
                message="Pruning timed out after 90 minutes.",
                duration_seconds=self.elapsed_time,
            )

        if self._orchestrator:
            self._orchestrator.unregister_process(scene_id)

        if proc.returncode != 0:
            last_err = "\n".join(stderr_lines[-5:]) if stderr_lines else "No stderr"
            return StepResult(
                exit_code=1,
                message=f"Pruning failed (non-fatal): {last_err}",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(exit_code=0, message="OK", duration_seconds=self.elapsed_time)
