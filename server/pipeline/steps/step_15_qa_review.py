"""Step 15: QA review -- final quality assurance before publishing."""

from __future__ import annotations

import json

from server.models import PipelineConfig, StepResult, StepStatusEnum
from server.pipeline.steps.base import StepBase


class QAReviewStep(StepBase):
    """Run automated quality checks and present results for human review."""

    step_num: int = 15
    step_name: str = "qa_review"

    async def run(self, scene_id: str, config: PipelineConfig) -> StepResult:
        """Check file sizes, asset integrity, and present for review."""
        scene_dir = self.get_scene_dir(scene_id)
        output_dir = scene_dir / "output"

        issues: list[str] = []
        summary: dict[str, object] = {}

        # Check required files
        desktop_spz = output_dir / "scene_desktop.spz"
        quest_spz = output_dir / "scene_quest.spz"
        alignment = output_dir / "alignment.json"

        if desktop_spz.exists():
            size_mb = desktop_spz.stat().st_size / (1024 * 1024)
            summary["desktop_spz_mb"] = round(size_mb, 1)
            if size_mb > 100:
                issues.append(f"Desktop SPZ is large: {size_mb:.1f}MB")
        else:
            issues.append("Missing: scene_desktop.spz")

        if quest_spz.exists():
            size_mb = quest_spz.stat().st_size / (1024 * 1024)
            summary["quest_spz_mb"] = round(size_mb, 1)
            if size_mb > 50:
                issues.append(f"Quest SPZ exceeds 50MB budget: {size_mb:.1f}MB")
        else:
            issues.append("Missing: scene_quest.spz")

        if alignment.exists():
            summary["alignment"] = True
        else:
            issues.append("Missing: alignment.json")

        # Optional files
        collision_mesh = output_dir / "collision_mesh.glb"
        summary["collision_mesh"] = collision_mesh.exists()

        flythrough = output_dir / "flythrough.mp4"
        summary["flythrough_video"] = flythrough.exists()

        floor_plane = output_dir / "floor_plane.json"
        summary["floor_plane"] = floor_plane.exists()

        # Check PLY
        ply_pruned = output_dir / "point_cloud_pruned.ply"
        ply_raw = output_dir / "point_cloud.ply"
        if ply_pruned.exists():
            summary["ply_source"] = "pruned"
            summary["ply_mb"] = round(ply_pruned.stat().st_size / (1024 * 1024), 1)
        elif ply_raw.exists():
            summary["ply_source"] = "raw"
            summary["ply_mb"] = round(ply_raw.stat().st_size / (1024 * 1024), 1)

        # Write QA summary
        qa_path = output_dir / "qa_summary.json"
        qa_data = {"summary": summary, "issues": issues}
        qa_path.write_text(json.dumps(qa_data, indent=2), encoding="utf-8")

        await self.write_log(scene_id, f"QA Summary: {json.dumps(summary, indent=2)}")
        if issues:
            for issue in issues:
                await self.write_log(scene_id, f"  Issue: {issue}")

        # Set status to awaiting review
        await self.update_status(
            scene_id,
            StepStatusEnum.AWAITING_REVIEW,
            f"QA complete. {len(issues)} issue(s) found. Ready for review.",
        )

        # Determine exit code
        critical_missing = not desktop_spz.exists() or not quest_spz.exists()
        if critical_missing:
            return StepResult(
                exit_code=2,
                message=f"Critical files missing: {', '.join(issues)}",
                duration_seconds=self.elapsed_time,
            )

        if issues:
            return StepResult(
                exit_code=1,
                message=f"QA complete with {len(issues)} warning(s). Ready for review.",
                duration_seconds=self.elapsed_time,
            )

        return StepResult(
            exit_code=0,
            message="QA passed. All assets present and within budgets.",
            duration_seconds=self.elapsed_time,
        )
