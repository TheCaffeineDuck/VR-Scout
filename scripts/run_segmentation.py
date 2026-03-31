#!/usr/bin/env python3
"""Background segmentation using depth-based masking.

Standalone script called by step_08_segmentation via subprocess.
Prints SEG_PROGRESS:completed/total for progress tracking.

TODO: Integrate SAM 2 for more accurate panoptic segmentation.
Current implementation uses depth thresholding for background detection.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate segmentation masks")
    parser.add_argument("--frames_dir", type=Path, required=True)
    parser.add_argument("--output_dir", type=Path, required=True)
    parser.add_argument("--depth_dir", type=Path, default=None)
    parser.add_argument("--method", default="depth", choices=["depth", "threshold"])
    parser.add_argument("--depth_percentile", type=float, default=95.0)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    try:
        import numpy as np
        from PIL import Image
    except ImportError as exc:
        print(f"ERROR: Missing dependency: {exc}", file=sys.stderr)
        return 1

    # Collect frame files
    frame_files = sorted(args.frames_dir.glob("frame_*.*"))
    if not frame_files:
        frame_files = sorted(
            f for f in args.frames_dir.iterdir()
            if f.suffix.lower() in (".jpg", ".jpeg", ".png")
        )

    if not frame_files:
        print("ERROR: No frame files found", file=sys.stderr)
        return 1

    total = len(frame_files)
    print(f"Generating masks for {total} frames using {args.method} method")

    if args.method == "depth" and args.depth_dir is not None:
        # Compute global depth threshold from all depth maps
        print("Computing global depth threshold...")
        all_depths: list[float] = []
        sample_indices = list(range(0, total, max(1, total // 20)))  # Sample ~20 frames
        for idx in sample_indices:
            depth_name = frame_files[idx].stem + ".png"
            depth_path = args.depth_dir / depth_name
            if depth_path.exists():
                depth_img = np.array(Image.open(depth_path))
                # Sample 1000 random pixels for efficiency
                flat = depth_img.flatten()
                if len(flat) > 1000:
                    sample = np.random.default_rng(42).choice(flat, 1000, replace=False)
                else:
                    sample = flat
                all_depths.extend(sample.tolist())

        if not all_depths:
            print("WARNING: No depth maps found, falling back to threshold method",
                  file=sys.stderr)
            args.method = "threshold"
        else:
            depth_threshold = float(np.percentile(all_depths, args.depth_percentile))
            print(f"Depth threshold (P{args.depth_percentile}): {depth_threshold}")

    for idx, frame_path in enumerate(frame_files):
        output_name = frame_path.stem + ".png"
        output_path = args.output_dir / output_name

        try:
            if args.method == "depth" and args.depth_dir is not None:
                depth_name = frame_path.stem + ".png"
                depth_path = args.depth_dir / depth_name
                if depth_path.exists():
                    depth_img = np.array(Image.open(depth_path), dtype=np.float32)
                    # 1 = keep (foreground), 0 = mask out (background/sky)
                    mask = (depth_img < depth_threshold).astype(np.uint8) * 255
                else:
                    # No depth map for this frame — keep everything
                    img = Image.open(frame_path)
                    mask = np.ones((img.height, img.width), dtype=np.uint8) * 255
            else:
                # Simple threshold: top 15% of image is likely sky for outdoor scenes
                img = Image.open(frame_path).convert("RGB")
                img_np = np.array(img)
                h = img_np.shape[0]
                mask = np.ones((h, img_np.shape[1]), dtype=np.uint8) * 255
                # Mask top portion if it looks like sky (high brightness, low saturation)
                top_region = img_np[:h // 6, :, :]
                brightness = np.mean(top_region, axis=2)
                sky_pixels = brightness > 180
                mask[:h // 6, :][sky_pixels] = 0

            mask_img = Image.fromarray(mask, mode="L")
            mask_img.save(str(output_path))

        except Exception as exc:
            print(f"WARNING: Failed to process {frame_path.name}: {exc}", file=sys.stderr)

        print(f"SEG_PROGRESS:{idx + 1}/{total}")

    completed = len(list(args.output_dir.glob("*.png")))
    print(f"Segmentation complete: {completed}/{total} masks generated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
