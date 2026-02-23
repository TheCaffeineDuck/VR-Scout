# Rendering Quality Report — Phase 1 Baseline

**Date:** February 23, 2026  
**Project:** TSL Splat Renderer  
**Phase:** 1 — Clean Baseline & Commit

---

## 1. Build & Test Results

| Check | Status |
|-------|--------|
| `npm run build` | ✅ Pass |
| `npm test` | ✅ Pass |
| Test count | 33 tests across 6 files |
| Test duration | ~1.1s |

### Test Files
- `parseSplat.test.ts` — 4 tests
- `parsePly.test.ts` — 5 tests
- `parseSpz.test.ts` — 5 tests
- `sort.test.ts` — 6 tests
- `splatData.test.ts` — 10 tests
- `regression.test.ts` — 3 tests (room.splat, room.ply, butterfly.spz)

---

## 2. WebGPU FPS Baseline

**Instructions:** Run `npm run dev`, open URLs in Chrome with WebGPU enabled. Confirm WebGPU backend in console. Record FPS for 30s idle + 30s orbit.

| Scene | Splat Count | Idle FPS (30s avg) | Orbit FPS (30s avg) | Backend |
|-------|-------------|--------------------|----------------------|---------|
| room.splat | 1,130,125 | _TBD_ | _TBD_ | WebGPU |
| bonsai.splat | _TBD_ | _TBD_ | _TBD_ | WebGPU |
| kitchen.splat | _TBD_ | _TBD_ | _TBD_ | WebGPU |

**URLs:**
- `http://localhost:5173/?file=room.splat`
- `http://localhost:5173/?file=bonsai.splat`
- `http://localhost:5173/?file=kitchen.splat`

**⚠️ Do NOT load `garden.splat`** — crashes Chrome GPU.

---

## 3. Visual Quality Score

**Scene:** room.splat  
**Rubric:** 10 = reference match (antimatter15)

| Criterion | Score (1–10) | Notes |
|-----------|--------------|-------|
| Solid surfaces | _TBD_ | No holes or flicker |
| Sorting artifacts | _TBD_ | No back-to-front errors |
| Color accuracy | _TBD_ | Matches reference |
| **Overall** | _TBD_ | |

---

## 4. Phase 1 Verification Checklist

- [x] Build passes (`npm run build`)
- [x] All tests pass (`npm test`)
- [ ] WebGPU FPS recorded for room, bonsai, kitchen
- [ ] Quality score documented
- [ ] Changes committed and tagged

---

## 5. Housekeeping (Phase 1)

- Removed macOS resource fork files (`._*.test.ts`) that caused Vitest to fail
- Added `._*` to `.gitignore` to prevent recurrence
