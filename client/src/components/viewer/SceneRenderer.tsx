import { useRef, useState, useEffect, useCallback, Component } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree, useFrame, extend } from '@react-three/fiber';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import type { ViewerProps } from '../../types/scene.ts';
import { FPSMeasure, FPSCounter } from './FPSCounter.tsx';
import './SceneRenderer.css';

// Register OrbitControls with R3F so we can use <orbitControls> in JSX
extend({ OrbitControls });

// Augment R3F's JSX namespace to recognize orbitControls
declare module '@react-three/fiber' {
  interface ThreeElements {
    orbitControls: ThreeElements['mesh'] & {
      args?: [THREE.Camera, HTMLElement];
      enableDamping?: boolean;
      dampingFactor?: number;
    };
  }
}

/**
 * SceneRenderer — core viewer component (extractable as standalone).
 * This component MUST NOT import from ../pipeline/, ../upload/, ../dashboard/, or ../../api/.
 * It only accepts a ViewerProps interface.
 */

// ---------- Error Boundary ----------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode; onError?: (error: Error) => void },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  override componentDidCatch(error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.props.onError?.(err);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="scene-renderer__error">
          <h3>Renderer Error</h3>
          <p>{this.state.error?.message ?? 'An unknown error occurred'}</p>
          <button
            className="btn btn--ghost"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- Spark Integration (R3F component inside Canvas) ----------

interface SparkSceneProps {
  spzUrl: string;
  alignmentUrl: string;
  maxStdDev: number;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onProgress?: (loaded: number, total: number) => void;
  enableControls?: boolean;
  showFloorGrid?: boolean;
  floorYOffset?: number;
  floorYRotation?: number;
}

function SparkScene({
  spzUrl,
  alignmentUrl,
  maxStdDev,
  onLoad,
  onError,
  enableControls = true,
  showFloorGrid = false,
  floorYOffset = 0,
  floorYRotation = 0,
}: SparkSceneProps) {
  const { gl, camera, scene } = useThree();
  const sparkRef = useRef<SparkRenderer | null>(null);
  const splatRef = useRef<SplatMesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Initialize SparkRenderer once
  useEffect(() => {
    const spark = new SparkRenderer({
      renderer: gl,
      maxStdDev,
      premultipliedAlpha: true,
    });
    sparkRef.current = spark;
    scene.add(spark);

    return () => {
      scene.remove(spark);
      spark.material.dispose();
      spark.geometry.dispose();
      sparkRef.current = null;
    };
    // gl and scene are stable refs in R3F; maxStdDev set once at init
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene]);

  // Load SplatMesh when URL changes
  useEffect(() => {
    let disposed = false;

    const mesh = new SplatMesh({ url: spzUrl });
    splatRef.current = mesh;
    scene.add(mesh);

    // Wait for load, then apply alignment
    mesh.initialized
      .then(async () => {
        if (disposed) return;

        // Fetch and apply alignment transform
        try {
          const resp = await fetch(alignmentUrl);
          if (resp.ok) {
            const alignment = (await resp.json()) as { transform?: number[] };
            if (alignment.transform) {
              mesh.matrix.fromArray(alignment.transform);
              mesh.matrixAutoUpdate = false;
            }
          }
          // If alignment fetch fails (404, etc.), just use identity — no alignment needed
        } catch {
          // Alignment is optional; proceed without it
        }

        if (!disposed) {
          onLoad?.();
        }
      })
      .catch((err: unknown) => {
        if (!disposed) {
          const error =
            err instanceof Error ? err : new Error('Failed to load SPZ scene');
          onError?.(error);
        }
      });

    return () => {
      disposed = true;
      scene.remove(mesh);
      mesh.dispose();
      splatRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spzUrl, alignmentUrl, scene]);

  // OrbitControls setup
  useEffect(() => {
    if (!enableControls) return;

    const domElement = gl.domElement;
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [enableControls, camera, gl.domElement]);

  // Update controls + SparkRenderer each frame
  useFrame(() => {
    controlsRef.current?.update();
  });

  return (
    <>
      {showFloorGrid && (
        <FloorGrid yOffset={floorYOffset} yRotation={floorYRotation} />
      )}
    </>
  );
}

// ---------- Floor Grid (R3F component inside Canvas) ----------

function FloorGrid({
  yOffset = 0,
  yRotation = 0,
}: {
  yOffset?: number;
  yRotation?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.y = yOffset;
    group.rotation.y = (yRotation * Math.PI) / 180;
  }, [yOffset, yRotation]);

  return (
    <group ref={groupRef}>
      <gridHelper args={[10, 20, 0x888888, 0x444444]} />
    </group>
  );
}

// ---------- Main SceneRenderer Component ----------

export function SceneRenderer({
  sceneConfig,
  enableControls = true,
  onLoad,
  onError,
  onProgress,
  showFloorGrid = false,
  floorYOffset = 0,
  floorYRotation = 0,
}: ViewerProps & {
  showFloorGrid?: boolean;
  floorYOffset?: number;
  floorYRotation?: number;
}) {
  const [fps, setFps] = useState(0);

  const handleFps = useCallback((value: number) => {
    setFps(value);
  }, []);

  // Suppress unused var warning — onProgress is part of ViewerProps contract
  // but SplatMesh constructor in Spark 0.1.10 does not expose download progress.
  void onProgress;

  return (
    <div className="scene-renderer">
      <ViewerErrorBoundary onError={onError}>
        <Canvas
          gl={{
            antialias: false,
            toneMapping: THREE.NoToneMapping,
            outputColorSpace: THREE.LinearSRGBColorSpace,
          }}
          camera={{ position: [0, 1.6, 5], fov: 60 }}
        >
          <SparkScene
            spzUrl={sceneConfig.spzUrl}
            alignmentUrl={sceneConfig.alignmentUrl}
            maxStdDev={sceneConfig.maxStdDev ?? Math.sqrt(5)}
            onLoad={onLoad}
            onError={onError}
            enableControls={enableControls}
            showFloorGrid={showFloorGrid}
            floorYOffset={floorYOffset}
            floorYRotation={floorYRotation}
          />
          <FPSMeasure onFps={handleFps} />
        </Canvas>
      </ViewerErrorBoundary>
      <FPSCounter fps={fps} />
    </div>
  );
}
