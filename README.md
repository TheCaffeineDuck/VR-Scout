# VR Scout v4

Hardware-adaptive Gaussian Splatting pipeline with generative AI enhancement for converting real-world video footage into photorealistic 3D scenes viewable in VR.

## Quick Start

```bash
# 1. Set up hardware-adaptive environment (Linux/WSL)
bash scripts/setup_environment.sh

# 2. Install client dependencies
cd client && npm install

# 3. Start the server
cd server && uvicorn main:app --host 0.0.0.0 --port 8002

# 4. Start the client dev server
cd client && npm run dev
```

## Architecture

- **Server**: FastAPI + aiosqlite + WebSocket pipeline orchestration
- **Client**: React 19 + React Three Fiber + Spark renderer + TypeScript
- **Pipeline**: 16-step automated processing (COLMAP, gsplat, Depth Anything, SAM 2)
- **Output**: Two-tier SPZ (desktop + Quest 3), collision mesh, flythrough video

See `VR_Scout_v4_Design_Plan.md` for the complete design specification.
