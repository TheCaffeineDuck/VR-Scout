#!/usr/bin/env python3
"""Batch depth estimation using Depth Anything V2.

Standalone script called by step_02_depth_estimation via subprocess.
Prints DEPTH_PROGRESS:completed/total lines for progress tracking.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Depth Anything V2 on frames")
    parser.add_argument("--frames_dir", type=Path, required=True)
    parser.add_argument("--output_dir", type=Path, required=True)
    parser.add_argument("--model_size", default="Base", choices=["Small", "Base", "Large"])
    parser.add_argument("--batch_size", type=int, default=4)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

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
    print(f"Processing {total} frames with Depth Anything V2 ({args.model_size})")

    # Try to import depth estimation library
    try:
        import numpy as np
        import torch
        from PIL import Image
    except ImportError as exc:
        print(f"ERROR: Missing dependency: {exc}", file=sys.stderr)
        print("Install with: pip install torch numpy pillow", file=sys.stderr)
        return 1

    # Try Depth Anything V2
    model = None
    try:
        from depth_anything_v2.dpt import DepthAnythingV2

        encoder_map = {"Small": "vits", "Base": "vitb", "Large": "vitl"}
        encoder = encoder_map.get(args.model_size, "vitb")

        # Model configs for different sizes
        model_configs = {
            "vits": {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]},
            "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96, 192, 384, 768]},
            "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
        }

        model = DepthAnythingV2(**model_configs[encoder])

        # Try to find checkpoint
        checkpoint_paths = [
            Path(f"checkpoints/depth_anything_v2_{encoder}.pth"),
            Path.home() / ".cache" / "depth_anything_v2" / f"depth_anything_v2_{encoder}.pth",
        ]
        loaded = False
        for ckpt in checkpoint_paths:
            if ckpt.exists():
                model.load_state_dict(torch.load(str(ckpt), map_location="cpu", weights_only=True))
                loaded = True
                break

        if not loaded:
            print(f"WARNING: No checkpoint found for {encoder}. Attempting HuggingFace download...",
                  file=sys.stderr)
            try:
                from huggingface_hub import hf_hub_download
                ckpt_path = hf_hub_download(
                    f"depth-anything/Depth-Anything-V2-{args.model_size}",
                    filename=f"depth_anything_v2_{encoder}.pth",
                )
                model.load_state_dict(torch.load(ckpt_path, map_location="cpu", weights_only=True))
            except Exception as dl_exc:
                print(f"ERROR: Could not load model checkpoint: {dl_exc}", file=sys.stderr)
                return 1

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device).eval()
        print(f"Depth Anything V2 loaded on {device}")

    except ImportError:
        print("WARNING: depth_anything_v2 not available. Using simple disparity estimation.",
              file=sys.stderr)
        model = None

    # Process frames
    for idx, frame_path in enumerate(frame_files):
        output_name = frame_path.stem + ".png"
        output_path = args.output_dir / output_name

        if output_path.exists():
            print(f"DEPTH_PROGRESS:{idx + 1}/{total}")
            continue

        try:
            img = Image.open(frame_path).convert("RGB")
            img_np = np.array(img)

            if model is not None:
                with torch.no_grad():
                    depth = model.infer_image(img_np)
                # Normalize to 16-bit range
                depth_min = depth.min()
                depth_max = depth.max()
                if depth_max - depth_min > 0:
                    depth_norm = (depth - depth_min) / (depth_max - depth_min)
                else:
                    depth_norm = np.zeros_like(depth)
                depth_16bit = (depth_norm * 65535).astype(np.uint16)
            else:
                # Simple fallback: convert to grayscale as pseudo-depth
                gray = np.mean(img_np, axis=2).astype(np.uint16)
                depth_16bit = gray * 256  # Scale to 16-bit range

            depth_img = Image.fromarray(depth_16bit, mode="I;16")
            depth_img.save(str(output_path))

        except Exception as exc:
            print(f"WARNING: Failed to process {frame_path.name}: {exc}", file=sys.stderr)

        print(f"DEPTH_PROGRESS:{idx + 1}/{total}")

        # Clear CUDA cache periodically to prevent OOM on constrained hardware
        if model is not None and (idx + 1) % 50 == 0:
            try:
                torch.cuda.empty_cache()
            except Exception:
                pass

    completed = len(list(args.output_dir.glob("*.png")))
    print(f"Depth estimation complete: {completed}/{total} maps generated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
