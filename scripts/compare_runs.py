#!/usr/bin/env python3
"""Compare metrics between two gsplat training runs.

Reads output directories from two gsplat runs and compares PSNR, SSIM, LPIPS,
Gaussian count, and training time. Outputs a formatted comparison table to
stdout, with an optional --json flag for machine-readable output.

Usage:
    python compare_runs.py /path/to/run_a /path/to/run_b
    python compare_runs.py /path/to/run_a /path/to/run_b --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def find_metrics_file(run_dir: Path) -> Path | None:
    """Search for gsplat metrics/results in common output locations."""
    # gsplat simple_trainer writes results to various locations
    candidates = [
        run_dir / "stats" / "results.json",
        run_dir / "results.json",
        run_dir / "stats.json",
        run_dir / "metrics.json",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def find_ply_file(run_dir: Path) -> Path | None:
    """Find the output PLY file."""
    candidates = [
        run_dir / "point_cloud.ply",
        run_dir / "splats.ply",
    ]
    for c in candidates:
        if c.is_file():
            return c
    # Search recursively
    plys = list(run_dir.glob("**/*.ply"))
    return plys[0] if plys else None


def parse_training_log(run_dir: Path) -> dict[str, Any]:
    """Parse training metrics from log files if JSON metrics unavailable."""
    metrics: dict[str, Any] = {}

    # Try to find training log
    log_candidates = [
        run_dir / "training.log",
        run_dir / "train.log",
    ]
    # Also check parent dir for step_7_training.log pattern
    parent_logs = run_dir.parent / "logs"
    if parent_logs.is_dir():
        for f in parent_logs.iterdir():
            if "training" in f.name and f.suffix == ".log":
                log_candidates.append(f)

    for log_path in log_candidates:
        if not log_path.is_file():
            continue
        text = log_path.read_text(errors="replace")
        lines = text.strip().split("\n")

        # Extract last known values
        for line in reversed(lines):
            line_lower = line.lower()
            if "psnr" in line_lower and "psnr" not in metrics:
                try:
                    # Try common patterns like "PSNR: 28.3" or "psnr=28.3"
                    for part in line.split():
                        if "psnr" in part.lower():
                            continue
                        try:
                            val = float(part.strip(",;:="))
                            if 10 < val < 60:  # Reasonable PSNR range
                                metrics["psnr"] = val
                                break
                        except ValueError:
                            continue
                except (ValueError, IndexError):
                    pass

            if "ssim" in line_lower and "ssim" not in metrics:
                for part in line.split():
                    if "ssim" in part.lower():
                        continue
                    try:
                        val = float(part.strip(",;:="))
                        if 0 < val <= 1:  # SSIM range
                            metrics["ssim"] = val
                            break
                    except ValueError:
                        continue

            if "lpips" in line_lower and "lpips" not in metrics:
                for part in line.split():
                    if "lpips" in part.lower():
                        continue
                    try:
                        val = float(part.strip(",;:="))
                        if 0 <= val <= 1:
                            metrics["lpips"] = val
                            break
                    except ValueError:
                        continue

        if metrics:
            break

    return metrics


def gather_run_info(run_dir: Path) -> dict[str, Any]:
    """Gather all available metrics from a run directory."""
    info: dict[str, Any] = {
        "path": str(run_dir),
        "psnr": None,
        "ssim": None,
        "lpips": None,
        "gaussian_count": None,
        "training_time_seconds": None,
        "ply_size_mb": None,
    }

    # Try JSON metrics file first
    metrics_file = find_metrics_file(run_dir)
    if metrics_file:
        try:
            data = json.loads(metrics_file.read_text())
            # gsplat may nest metrics differently depending on version
            if isinstance(data, dict):
                for key in ["psnr", "PSNR"]:
                    if key in data:
                        info["psnr"] = float(data[key])
                for key in ["ssim", "SSIM"]:
                    if key in data:
                        info["ssim"] = float(data[key])
                for key in ["lpips", "LPIPS"]:
                    if key in data:
                        info["lpips"] = float(data[key])
                for key in ["num_gaussians", "gaussian_count", "num_points"]:
                    if key in data:
                        info["gaussian_count"] = int(data[key])
                for key in ["elapsed_time", "training_time", "elapsed_seconds"]:
                    if key in data:
                        info["training_time_seconds"] = float(data[key])
        except (json.JSONDecodeError, ValueError, KeyError):
            pass

    # Fill gaps from log parsing
    log_metrics = parse_training_log(run_dir)
    for key in ["psnr", "ssim", "lpips"]:
        if info[key] is None and key in log_metrics:
            info[key] = log_metrics[key]

    # PLY file size
    ply = find_ply_file(run_dir)
    if ply:
        info["ply_size_mb"] = round(ply.stat().st_size / (1024 * 1024), 1)

    return info


def format_value(val: Any, fmt: str = ".4f") -> str:
    """Format a value for display, handling None."""
    if val is None:
        return "N/A"
    if isinstance(val, float):
        return f"{val:{fmt}}"
    return str(val)


def format_diff(a: Any, b: Any, higher_is_better: bool = True) -> str:
    """Format the difference between two values."""
    if a is None or b is None:
        return ""
    diff = b - a
    if abs(diff) < 1e-6:
        return "  (same)"
    arrow = "+" if diff > 0 else ""
    is_better = (diff > 0) == higher_is_better
    marker = " *" if is_better else ""
    if isinstance(diff, float):
        return f"  ({arrow}{diff:.4f}{marker})"
    return f"  ({arrow}{diff}{marker})"


def print_table(run_a: dict[str, Any], run_b: dict[str, Any]) -> None:
    """Print a formatted comparison table."""
    name_a = Path(run_a["path"]).name
    name_b = Path(run_b["path"]).name

    print(f"\n{'Metric':<25} {'Run A (' + name_a + ')':<20} {'Run B (' + name_b + ')':<20} {'Diff':<20}")
    print("-" * 85)

    rows = [
        ("PSNR (dB)", "psnr", ".2f", True),
        ("SSIM", "ssim", ".4f", True),
        ("LPIPS", "lpips", ".4f", False),
        ("Gaussian Count", "gaussian_count", ",", None),
        ("PLY Size (MB)", "ply_size_mb", ".1f", False),
        ("Training Time (s)", "training_time_seconds", ".0f", False),
    ]

    for label, key, fmt, higher_better in rows:
        val_a = run_a.get(key)
        val_b = run_b.get(key)

        if fmt == ",":
            str_a = f"{val_a:,}" if val_a is not None else "N/A"
            str_b = f"{val_b:,}" if val_b is not None else "N/A"
            diff_str = ""
            if val_a is not None and val_b is not None:
                d = val_b - val_a
                diff_str = f"  ({'+' if d > 0 else ''}{d:,})"
        else:
            str_a = format_value(val_a, fmt)
            str_b = format_value(val_b, fmt)
            diff_str = format_diff(val_a, val_b, higher_better) if higher_better is not None else ""

        print(f"{label:<25} {str_a:<20} {str_b:<20} {diff_str}")

    print()
    print("* = better value")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare metrics between two gsplat training runs."
    )
    parser.add_argument(
        "run_a",
        help="Path to first run output directory",
    )
    parser.add_argument(
        "run_b",
        help="Path to second run output directory",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output comparison as JSON instead of table",
    )

    args = parser.parse_args()

    run_a_path = Path(args.run_a)
    run_b_path = Path(args.run_b)

    for p in [run_a_path, run_b_path]:
        if not p.is_dir():
            print(f"ERROR: Directory not found: {p}", file=sys.stderr)
            sys.exit(1)

    run_a = gather_run_info(run_a_path)
    run_b = gather_run_info(run_b_path)

    if args.json:
        output = {
            "run_a": run_a,
            "run_b": run_b,
        }
        print(json.dumps(output, indent=2))
    else:
        print_table(run_a, run_b)


if __name__ == "__main__":
    main()
