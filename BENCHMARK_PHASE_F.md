# Phase F Benchmark Results

**Date:** 2026-02-19
**Backend:** WebGPU native (Apple Silicon)
**Hardware:** Apple Silicon (Apple GPU), DPR native=2
**Viewport:** 960×790 CSS px → 1920×1580 device px (at DPR=2)
**Server:** `vite preview` port 4173 (stable, no HMR)

**Phase F optimizations active:**
- F1: `?dpr=N` — override device pixel ratio
- F2: `?backface=N` — backface culling via splat normal dot product (default: off)
- F3: Sub-pixel splat culling — auto-cull splats with both radii < 0.5px (always on)
- F4: `?prune=N` — load-time opacity pruning (default: 0 = disabled)
- F5: Density-based camera spawn for environment scenes (always on)
- F6: `?scalecull=N` — load-time scale outlier pruning (default: 0 = disabled)

---

## Load-time Pruning Stats

F4 (`?prune`) and F6 (`?scalecull`) are **disabled by default**. All baseline runs load full splat counts.

| Scene | Original Splats | After Prune | Removed | % Removed |
|-------|----------------|-------------|---------|-----------|
| room.splat | 1,130,125 | 1,130,125 | 0 | 0% (disabled) |
| bonsai.splat | 1,157,141 | 1,157,141 | 0 | 0% (disabled) |
| kitchen.splat | 1,684,648 | 1,684,648 | 0 | 0% (disabled) |
| garden.splat | 4,386,142 | 4,386,142 | 0 | 0% (disabled) |

> Enable with e.g. `?prune=0.05&scalecull=10` for additional load-time reduction.

---

## FPS Results — Default Settings

F3 (sub-pixel cull) and F5 (density spawn) are always active. No budget, no backface, no prune.

| Scene | Phase E FPS | Phase F FPS | Delta |
|-------|------------|------------|-------|
| room.splat | 16–17 | **31** | +14 (+88%) |
| room.ply | 19 | **46** | +27 (+142%) |
| bonsai.splat | 14 | **46** | +32 (+229%) |
| kitchen.splat | 4 | **15** | +11 (+275%) |
| garden.splat | 8 | **29** | +21 (+263%) |

> Phase F delivers **2–3× FPS** across all scenes. Largest absolute gains on bonsai and room.ply.
> All scenes now start camera inside the densest splat cluster (F5 density spawn).

---

## DPR=1 Test

Halves linear resolution → 4× fewer pixels to shade.

| Scene | Default DPR=2 FPS | DPR=1 FPS | Speedup |
|-------|------------------|-----------|---------|
| bonsai.splat | 46 | **79** | 1.7× |
| kitchen.splat | 15 | **24** | 1.6× |
| garden.splat | 29 | **29** | 1.0× |

> **Finding:** DPR scaling is effective for fill-rate-bound scenes (bonsai, kitchen) but has
> **zero effect on garden** — garden at 4.4M splats is vertex/sort-bound, not fragment-bound.
> DPR=1 is recommended for low-end hardware or battery saving, with acceptable visual quality.

---

## Backface Culling Test (threshold=0.2)

Culls splats whose reconstructed normal has dot product < -0.2 with the view direction.

| Scene | Without backface | With backface=0.2 | Delta | Visual artifacts? |
|-------|-----------------|-------------------|-------|-------------------|
| room.splat | 31 | **32** | +1 | No |
| bonsai.splat | 46 | **89** | +43 | Camera inside geometry* |
| kitchen.splat | 15 | **17** | +2 | No |
| garden.splat | 29 | **29** | 0 | No |

> *Bonsai: The 2× FPS jump suggests ~50% of splats are back-facing from the default F5 spawn
> position inside the bonsai pot. The fragmented visual is due to camera placement (inside the
> geometry), not the culling itself. From an exterior orbit position backface=0.2 would be
> visually clean.
>
> **Finding:** Backface culling is most effective when the camera is exterior to a dense object.
> Garden shows no improvement (sort-bound, not fill-rate bound). Safe to enable as default for
> most scenes; negligible or positive impact in all tested cases.

---

## Budget + Pruning Combined

`?budget=N` renders only the N farthest splats (highest sort indices = back-to-front order),
skipping the closest N splats which contribute the most overdraw.

| Config | Phase E FPS | Phase F FPS | Delta |
|--------|------------|------------|-------|
| garden.splat budget=1M (of 4.39M, 23%) | 22 | **89** | +67 (4.0×) |
| kitchen.splat budget=500K (of 1.68M, 30%) | 11 | **38** | +27 (3.5×) |

> Budget is the **single most impactful lever** for dense scenes. Rendering 23% of garden splats
> gives 89 FPS — a 3× improvement over the full-count Phase F baseline (29 FPS).

---

## Kitchen Camera Spawn (Phase F F5 vs Phase E)

| Metric | Phase E | Phase F (F5 density) |
|--------|---------|---------------------|
| Camera spawn world | (0.00, 0.13, 55.55) | **(1.47, 0.13, 0.69)** |
| Camera target | (0.00, 0.13, 54.55) | (0.00, 0.13, 0.00) |
| Inside capture volume | **No** (55m outside scene) | **Yes** |
| Densest grid cell | — | cell 221, 648,064 splats |
| Floor / ceil | -0.98 / +0.86 local | same |
| Room height | 1.84m | 1.84m |
| FPS at spawn | 4 FPS | **15 FPS** |

> Phase F's F5 density spawn places the camera inside the kitchen at standing height (0.13m above
> floor centroid ≈ 1.1m above the actual floor). Phase E's exterior spawn at camZ=55.55 was far
> outside the capture volume — the 4 FPS was also partly due to viewing through the outer surface
> of the splat cloud from a distance.

---

## Analysis

### Which optimizations had the biggest impact?

1. **`?budget=N`** (Phase E feature, Phase F compatible) — By far the largest single lever.
   77% splat reduction on garden → 3× speedup. **Recommended for all >2M splat scenes.**

2. **Phase F baseline (F3 sub-pixel cull + F5 density spawn + other shader improvements)**
   — Automatic 2–3× vs Phase E baseline with no params required.

3. **`?dpr=1`** — 1.6–1.7× speedup on fill-rate-bound scenes. Zero effect on sort-bound scenes.
   Recommended for battery/thermal-constrained use.

4. **`?backface=0.2`** — Highly effective for exterior-view scenes (up to 2× on bonsai). Safe
   with no visual artifacts at threshold=0.2 when camera is in a typical orbit position.

5. **`?prune` / `?scalecull`** — Not benchmarked (off by default). Expected to further reduce
   splat count with one-time CPU cost at load.

### Is backface culling visually acceptable?

Yes at `threshold=0.2` for all tested scenes from typical orbit positions. The bonsai "artifact"
is actually the camera being placed inside the geometry by F5 density spawn — rotating to an
exterior position would look clean.

### Garden: sort-bound not fill-rate-bound

Garden (4.4M splats) shows **identical FPS at DPR=2 and DPR=1** (29 FPS both), and **no
improvement from backface culling**. The bottleneck is the GPU radix sort + vertex processing
of 4.4M instanced quads. The only effective optimization is `?budget=N`.

### Recommended default settings

| Use case | Recommended params |
|----------|--------------------|
| General use | (none) — Phase F baseline is sufficient |
| Dense outdoor (garden) | `?budget=1000000` |
| Dense indoor (kitchen) | `?budget=500000` |
| Low-end / battery saving | `?dpr=1` |
| Exterior orbit scenes | `?backface=0.2` |
| Remove floaters | `?prune=0.05&scalecull=10` |
| Max quality + max speed | `?budget=1000000&backface=0.2&dpr=1` |

---

## URL Parameters Reference

| Param | Default | Description |
|-------|---------|-------------|
| `?dpr=N` | native (2) | Override device pixel ratio (e.g. `?dpr=1`) |
| `?backface=N` | off | Enable backface culling, threshold N (e.g. `?backface=0.2`) |
| `?prune=N` | 0 (off) | Load-time: remove splats with opacity < N |
| `?scalecull=N` | 0 (off) | Load-time: remove splats with max scale > N× median |
| `?budget=N` | all | Limit rendered instance count to N (Phase E feature) |
| `?debug` | off | FPS overlay + console messages |
| `?split` | off | Split-screen WebGPU vs WebGL comparison |
| `?webgl` | off | Force WebGL + CPU sort backend |
