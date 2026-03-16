import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { getSparseCloud } from '../../api/client.ts';
import type { SparseCloudData } from '../../api/client.ts';
import { CameraFrustum } from './CameraFrustum.tsx';
import './SparseCloudViewer.css';

interface SparseCloudViewerProps {
  sceneId: string;
  mode: 'single' | 'comparison';
}

/** Color for camera frustum based on reprojection error (px). */
function errorColor(error: number): string {
  if (error < 0.5) return '#22c55e'; // green
  if (error < 1.0) return '#eab308'; // yellow
  return '#ef4444'; // red
}

// ---------- R3F Inner Scene ----------

interface CloudSceneProps {
  data: SparseCloudData;
  showGrid: boolean;
  autoFitOnce: React.MutableRefObject<boolean>;
}

function CloudScene({ data, showGrid, autoFitOnce }: CloudSceneProps) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  // OrbitControls setup
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;
    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl.domElement]);

  useFrame(() => {
    controlsRef.current?.update();
  });

  // Auto-fit camera to bounding box on first load
  useEffect(() => {
    if (autoFitOnce.current || data.points.length === 0) return;
    autoFitOnce.current = true;

    const positions = data.points;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of positions) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      if (p.z > maxZ) maxZ = p.z;
    }

    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    );
    const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    const radius = size.length() / 2;

    camera.position.set(
      center.x + radius * 1.5,
      center.y + radius * 0.5,
      center.z + radius * 1.5,
    );
    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
  }, [data, camera, autoFitOnce]);

  // Build point cloud geometry
  const pointsGeometry = useMemo(() => {
    const pts = data.points;
    const posArr = new Float32Array(pts.length * 3);
    const colArr = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      posArr[i * 3] = pts[i].x;
      posArr[i * 3 + 1] = pts[i].y;
      posArr[i * 3 + 2] = pts[i].z;
      colArr[i * 3] = pts[i].r / 255;
      colArr[i * 3 + 1] = pts[i].g / 255;
      colArr[i * 3 + 2] = pts[i].b / 255;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    return geo;
  }, [data.points]);

  const pointsMaterial = useMemo(
    () => new THREE.PointsMaterial({ vertexColors: true, size: 0.02, sizeAttenuation: true }),
    [],
  );

  // Registered cameras only for frustums
  const registeredCameras = useMemo(
    () => data.cameras.filter((c) => c.registered),
    [data.cameras],
  );

  return (
    <>
      <points geometry={pointsGeometry} material={pointsMaterial} />

      {registeredCameras.map((cam) => (
        <CameraFrustum
          key={cam.image_name}
          position={cam.position}
          rotationMatrix={cam.rotation_matrix}
          color={errorColor(cam.reprojection_error)}
          scale={0.1}
        />
      ))}

      {showGrid && <gridHelper args={[10, 20, 0x888888, 0x444444]} />}

      <ambientLight intensity={0.5} />
    </>
  );
}

// ---------- Main Component ----------

export function SparseCloudViewer({ sceneId, mode }: SparseCloudViewerProps) {
  const [sparseData, setSparseData] = useState<SparseCloudData | null>(null);
  const [alignedData, setAlignedData] = useState<SparseCloudData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'sparse' | 'aligned'>('sparse');
  const autoFitOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const sparse = await getSparseCloud(sceneId, 'sparse');
        if (cancelled) return;
        setSparseData(sparse);

        if (mode === 'comparison') {
          try {
            const aligned = await getSparseCloud(sceneId, 'aligned');
            if (!cancelled) setAlignedData(aligned);
          } catch {
            // Aligned data may not exist yet — that's okay
            if (!cancelled) setAlignedData(null);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load sparse cloud');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => { cancelled = true; };
  }, [sceneId, mode]);

  // Determine which data to display
  const activeData = activeSource === 'aligned' && alignedData ? alignedData : sparseData;

  // Check if alignment changed anything
  const alignmentApplied = useMemo(() => {
    if (!sparseData || !alignedData) return null;
    if (sparseData.cameras.length === 0 || alignedData.cameras.length === 0) return null;

    const sCam = sparseData.cameras.find((c) => c.registered);
    const aCam = alignedData.cameras.find((c) => c.image_name === sCam?.image_name);
    if (!sCam || !aCam) return null;

    const dist = Math.sqrt(
      (sCam.position[0] - aCam.position[0]) ** 2 +
      (sCam.position[1] - aCam.position[1]) ** 2 +
      (sCam.position[2] - aCam.position[2]) ** 2,
    );
    return dist > 0.001;
  }, [sparseData, alignedData]);

  const handleToggle = useCallback((source: 'sparse' | 'aligned') => {
    setActiveSource(source);
  }, []);

  if (loading) {
    return (
      <div className="sparse-cloud-viewer sparse-cloud-viewer--loading">
        <div className="sparse-cloud-viewer__spinner" />
        <span>Loading sparse reconstruction...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sparse-cloud-viewer sparse-cloud-viewer--error">
        <span>{error}</span>
      </div>
    );
  }

  if (!activeData) return null;

  const summary = activeData.summary;
  const unregisteredCount = activeData.cameras.filter((c) => !c.registered).length;

  return (
    <div className="sparse-cloud-viewer">
      {/* Header with toggle + stats */}
      <div className="sparse-cloud-viewer__header">
        {mode === 'comparison' && (
          <div className="sparse-cloud-viewer__toggle">
            <button
              className={`sparse-cloud-viewer__toggle-btn ${activeSource === 'sparse' ? 'sparse-cloud-viewer__toggle-btn--active' : ''}`}
              onClick={() => handleToggle('sparse')}
            >
              Before Alignment
            </button>
            <button
              className={`sparse-cloud-viewer__toggle-btn ${activeSource === 'aligned' ? 'sparse-cloud-viewer__toggle-btn--active' : ''}`}
              onClick={() => handleToggle('aligned')}
              disabled={!alignedData}
            >
              After Alignment
            </button>
          </div>
        )}

        <div className="sparse-cloud-viewer__stats">
          {summary.registered_images}/{summary.total_images} cameras registered
          {' · '}
          {summary.total_points.toLocaleString()} points
          {unregisteredCount > 0 && ` · ${unregisteredCount} unregistered`}
          {mode === 'comparison' && alignmentApplied !== null && (
            <span className={alignmentApplied ? 'sparse-cloud-viewer__align-ok' : 'sparse-cloud-viewer__align-warn'}>
              {alignmentApplied ? ' · Transform: applied' : ' · Transform: identity (alignment may have failed)'}
            </span>
          )}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="sparse-cloud-viewer__canvas">
        <Canvas
          gl={{
            antialias: true,
            toneMapping: THREE.NoToneMapping,
            outputColorSpace: THREE.LinearSRGBColorSpace,
          }}
          camera={{ fov: 60, near: 0.01, far: 1000 }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          <CloudScene
            data={activeData}
            showGrid={mode === 'comparison'}
            autoFitOnce={autoFitOnce}
          />
        </Canvas>
      </div>
    </div>
  );
}
