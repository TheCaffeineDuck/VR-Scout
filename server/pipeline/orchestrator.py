"""Pipeline orchestrator for running, cancelling, and resuming steps."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from server.models import PipelineConfig, StepResult, StepStatusEnum

if TYPE_CHECKING:
    from server.ws.handler import ConnectionManager

logger = logging.getLogger(__name__)


# Step registry: (step_num, module_path, class_name, condition_fn)
# condition_fn receives PipelineConfig, returns True if step should run
def _always(_c: PipelineConfig) -> bool:
    return True


def _depth_enabled(c: PipelineConfig) -> bool:
    return c.depth_estimation


def _segmentation_enabled(c: PipelineConfig) -> bool:
    return c.segmentation != "off"


def _pruning_enabled(c: PipelineConfig) -> bool:
    return c.perceptual_pruning


def _never(_c: PipelineConfig) -> bool:
    return False


_STEP_REGISTRY: list[tuple[int, str, str, Callable[[PipelineConfig], bool]]] = [
    (0, "server.pipeline.steps.step_00_preflight", "PreflightStep", _always),
    (1, "server.pipeline.steps.step_01_upload_extract", "UploadExtractStep", _always),
    (2, "server.pipeline.steps.step_02_depth_estimation", "DepthEstimationStep", _depth_enabled),
    (3, "server.pipeline.steps.step_03_feature_extraction", "FeatureExtractionStep", _always),
    (4, "server.pipeline.steps.step_04_matching", "MatchingStep", _always),
    (5, "server.pipeline.steps.step_05_mapping", "MappingStep", _always),
    (
        55, "server.pipeline.steps.step_05_5_panorama_registration",
        "PanoramaRegistrationStep", _always,
    ),
    (6, "server.pipeline.steps.step_06_alignment", "AlignmentStep", _always),
    (7, "server.pipeline.steps.step_07_validation", "ValidationStep", _always),
    (8, "server.pipeline.steps.step_08_segmentation", "SegmentationStep", _segmentation_enabled),
    (9, "server.pipeline.steps.step_09_training", "TrainingStep", _always),
    (10, "server.pipeline.steps.step_10_pruning", "PruningStep", _pruning_enabled),
    (11, "server.pipeline.steps.step_11_mesh_extraction", "MeshExtractionStep", _always),
    (12, "server.pipeline.steps.step_12_conversion", "ConversionStep", _always),
    (13, "server.pipeline.steps.step_13_video_render", "VideoRenderStep", _always),
    (14, "server.pipeline.steps.step_14_alignment_final", "AlignmentFinalStep", _always),
    (15, "server.pipeline.steps.step_15_qa_review", "QAReviewStep", _always),
]

# Steps that trigger a confirmation gate after completion
_CONFIRMATION_GATE_STEPS = {7}


def _import_step_class(module_path: str, class_name: str) -> Any:
    """Dynamically import a step class."""
    import importlib

    module = importlib.import_module(module_path)
    return getattr(module, class_name)


class PipelineOrchestrator:
    """Coordinates sequential execution of pipeline steps for a scene."""

    def __init__(self, ws_manager: ConnectionManager) -> None:
        self.ws = ws_manager
        self._active_tasks: dict[str, asyncio.Task[None]] = {}
        self._cancel_events: dict[str, asyncio.Event] = {}
        self._confirmation_events: dict[str, asyncio.Event] = {}
        self._current_run_ids: dict[str, str] = {}
        self._running_processes: dict[str, asyncio.subprocess.Process] = {}

    async def run_pipeline(
        self,
        scene_id: str,
        config: PipelineConfig,
        from_step: int = 0,
    ) -> None:
        """Run pipeline steps from start (or from_step) to finish."""
        from server import database as db

        # Cancel any existing run for this scene
        if scene_id in self._active_tasks:
            await self.cancel(scene_id)

        config_json = config.model_dump_json()
        run_id = await db.create_pipeline_run(scene_id, config_json)
        self._current_run_ids[scene_id] = run_id
        self._cancel_events[scene_id] = asyncio.Event()
        self._confirmation_events[scene_id] = asyncio.Event()

        task = asyncio.create_task(
            self._execute_steps(scene_id, run_id, config, from_step),
            name=f"pipeline-{scene_id}",
        )
        self._active_tasks[scene_id] = task

        def _on_done(t: asyncio.Task[None]) -> None:
            self._active_tasks.pop(scene_id, None)
            self._cancel_events.pop(scene_id, None)
            self._confirmation_events.pop(scene_id, None)
            self._current_run_ids.pop(scene_id, None)

        task.add_done_callback(_on_done)

    async def _execute_steps(
        self,
        scene_id: str,
        run_id: str,
        config: PipelineConfig,
        from_step: int,
    ) -> None:
        """Internal: run each step in sequence."""
        from server import database as db

        final_status = "completed"

        for step_num, module_path, class_name, condition_fn in _STEP_REGISTRY:
            # Skip steps before from_step
            if step_num < from_step:
                continue

            # Check cancellation
            if self._cancel_events.get(scene_id, asyncio.Event()).is_set():
                final_status = "cancelled"
                break

            # Check condition
            if not condition_fn(config):
                step_cls = _import_step_class(module_path, class_name)
                step_instance = step_cls()
                await db.update_step_status(
                    run_id, step_num, step_instance.step_name,
                    StepStatusEnum.SKIPPED.value, "Skipped by configuration",
                )
                await self.ws.broadcast_json(scene_id, {
                    "type": "status",
                    "data": {
                        "step_num": step_num,
                        "step_name": step_instance.step_name,
                        "status": StepStatusEnum.SKIPPED.value,
                        "message": "Skipped by configuration",
                    },
                })
                continue

            # Import and instantiate the step
            step_cls = _import_step_class(module_path, class_name)
            step_instance = step_cls()

            # Inject orchestrator context into step
            step_instance._run_id = run_id
            step_instance._ws_manager = self.ws
            step_instance._start_time = time.monotonic()
            step_instance._orchestrator = self

            # Mark step as running
            await db.update_step_status(
                run_id, step_num, step_instance.step_name,
                StepStatusEnum.RUNNING.value, "",
            )
            await self.ws.broadcast_json(scene_id, {
                "type": "status",
                "data": {
                    "step_num": step_num,
                    "step_name": step_instance.step_name,
                    "status": StepStatusEnum.RUNNING.value,
                    "message": "",
                },
            })

            # Execute step
            try:
                result = await step_instance.run(scene_id, config)
            except asyncio.CancelledError:
                await db.update_step_status(
                    run_id, step_num, step_instance.step_name,
                    StepStatusEnum.FAILED.value, "Cancelled",
                )
                final_status = "cancelled"
                break
            except Exception as exc:
                logger.exception(
                    "Step %d (%s) failed", step_num, step_instance.step_name,
                )
                await db.update_step_status(
                    run_id, step_num, step_instance.step_name,
                    StepStatusEnum.FAILED.value, str(exc),
                )
                await self.ws.broadcast_json(scene_id, {
                    "type": "status",
                    "data": {
                        "step_num": step_num,
                        "step_name": step_instance.step_name,
                        "status": StepStatusEnum.FAILED.value,
                        "message": str(exc),
                    },
                })
                final_status = "failed"
                break

            # Process result based on exit code
            result = result or StepResult()
            if result.exit_code == 0:
                status = StepStatusEnum.COMPLETED
            elif result.exit_code == 1:
                status = StepStatusEnum.WARNING
            else:
                status = StepStatusEnum.BLOCKED

            await db.update_step_status(
                run_id, step_num, step_instance.step_name,
                status.value, result.message,
            )
            await self.ws.broadcast_json(scene_id, {
                "type": "status",
                "data": {
                    "step_num": step_num,
                    "step_name": step_instance.step_name,
                    "status": status.value,
                    "message": result.message,
                },
            })

            # Block on exit_code 2
            if result.exit_code >= 2:
                final_status = "blocked"
                break

            # Confirmation gate after specific steps
            if step_num in _CONFIRMATION_GATE_STEPS:
                await db.update_step_status(
                    run_id, step_num, step_instance.step_name,
                    StepStatusEnum.AWAITING_CONFIRMATION.value,
                    "Waiting for user confirmation to continue",
                )
                await self.ws.broadcast_json(scene_id, {
                    "type": "status",
                    "data": {
                        "step_num": step_num,
                        "step_name": step_instance.step_name,
                        "status": StepStatusEnum.AWAITING_CONFIRMATION.value,
                        "message": "Waiting for user confirmation to continue",
                    },
                })
                # Wait for confirmation or cancellation
                confirm_event = self._confirmation_events.get(scene_id)
                cancel_event = self._cancel_events.get(scene_id)
                if confirm_event and cancel_event:
                    done, _ = await asyncio.wait(
                        [
                            asyncio.create_task(confirm_event.wait()),
                            asyncio.create_task(cancel_event.wait()),
                        ],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if cancel_event.is_set():
                        final_status = "cancelled"
                        break

        # Mark pipeline run as complete
        await db.complete_pipeline_run(run_id, final_status)

    async def cancel(self, scene_id: str) -> None:
        """Cancel a running pipeline for the given scene."""
        cancel_event = self._cancel_events.get(scene_id)
        if cancel_event:
            cancel_event.set()

        # Also set confirmation event to unblock any gate
        confirm_event = self._confirmation_events.get(scene_id)
        if confirm_event:
            confirm_event.set()

        # Kill any subprocess
        proc = self._running_processes.pop(scene_id, None)
        if proc and proc.returncode is None:
            try:
                proc.kill()
            except ProcessLookupError:
                pass

        # Cancel the task
        task = self._active_tasks.get(scene_id)
        if task and not task.done():
            task.cancel()

    async def resume(self, scene_id: str, from_step: int) -> None:
        """Resume a pipeline from the specified step number."""
        from server import database as db

        latest_run = await db.get_latest_run(scene_id)
        if latest_run is None:
            raise ValueError(f"No pipeline run found for scene {scene_id}")

        config = PipelineConfig.model_validate_json(str(latest_run["config_json"]))
        await self.run_pipeline(scene_id, config, from_step=from_step)

    def confirm(self, scene_id: str) -> None:
        """Unblock the confirmation gate for a scene."""
        event = self._confirmation_events.get(scene_id)
        if event:
            event.set()

    def register_process(self, scene_id: str, proc: asyncio.subprocess.Process) -> None:
        """Register a running subprocess so it can be killed on cancel."""
        self._running_processes[scene_id] = proc

    def unregister_process(self, scene_id: str) -> None:
        """Remove a subprocess from the tracking dict."""
        self._running_processes.pop(scene_id, None)
