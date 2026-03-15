import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSceneConfig } from '../../api/client.ts';
import type { SceneConfig } from '../../types/scene.ts';
import { formatNumber } from '../../utils/format.ts';
import { SceneRenderer } from '../viewer/SceneRenderer.tsx';
import { ViewerControls } from '../viewer/ViewerControls.tsx';
import { FloorPlaneAdjuster } from './FloorPlaneAdjuster.tsx';
import './QAReview.css';

export function QAReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sceneId = id ?? '';

  const [scene, setScene] = useState<SceneConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Floor grid state — shared between FloorPlaneAdjuster and SceneRenderer
  const [showFloorGrid, setShowFloorGrid] = useState(false);
  const [floorYOffset, setFloorYOffset] = useState(0);
  const [floorYRotation, setFloorYRotation] = useState(0);

  // Overlay toggles
  const [showCameraPath, setShowCameraPath] = useState(true);
  const [showBoundingBox, setShowBoundingBox] = useState(false);
  const [showSparsePoints, setShowSparsePoints] = useState(false);

  useEffect(() => {
    getSceneConfig(sceneId)
      .then(setScene)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load scene'),
      );
  }, [sceneId]);

  if (error) {
    return <div className="qa-review__error">Error: {error}</div>;
  }

  if (!scene) {
    return <div className="qa-review__loading">Loading scene...</div>;
  }

  return (
    <div className="qa-review">
      <div className="qa-review__viewer">
        <SceneRenderer
          sceneConfig={scene}
          enableVR
          enableControls
          showFloorGrid={showFloorGrid}
          floorYOffset={floorYOffset}
          floorYRotation={floorYRotation}
        />
      </div>

      <div className="qa-review__panel">
        <div className="qa-review__section">
          <h4>Scene Info</h4>
          <div className="qa-review__info-row">
            <span>Gaussians</span>
            <span>{formatNumber(scene.gaussianCount)}</span>
          </div>
          <div className="qa-review__info-row">
            <span>SH Degree</span>
            <span>{scene.shDegree}</span>
          </div>
        </div>

        <div className="qa-review__section">
          <FloorPlaneAdjuster
            sceneId={sceneId}
            showFloorGrid={showFloorGrid}
            onToggleFloorGrid={() => setShowFloorGrid((v) => !v)}
            yOffset={floorYOffset}
            yRotation={floorYRotation}
            onYOffsetChange={setFloorYOffset}
            onYRotationChange={setFloorYRotation}
          />
        </div>

        <div className="qa-review__section">
          <h4>Overlays</h4>
          <ViewerControls
            showFloorGrid={showFloorGrid}
            showCameraPath={showCameraPath}
            showBoundingBox={showBoundingBox}
            showSparsePoints={showSparsePoints}
            onToggleFloorGrid={() => setShowFloorGrid((v) => !v)}
            onToggleCameraPath={() => setShowCameraPath((v) => !v)}
            onToggleBoundingBox={() => setShowBoundingBox((v) => !v)}
            onToggleSparsePoints={() => setShowSparsePoints((v) => !v)}
          />
        </div>

        <div className="qa-review__section">
          <h4>Actions</h4>
          <div className="qa-review__action-btns">
            <button className="btn btn--primary btn--full">Enter VR</button>
            <button className="btn btn--full">Export SPZ</button>
            <button
              className="btn btn--full"
              onClick={() => void navigate(`/scene/${sceneId}/upload`)}
            >
              Re-process
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
