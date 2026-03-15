import './ViewerControls.css';

/**
 * ViewerControls — overlay toggles for the 3D viewer.
 * This component MUST NOT import from ../pipeline/, ../upload/, ../dashboard/, or ../../api/.
 */

interface ViewerControlsProps {
  showFloorGrid?: boolean;
  showCameraPath?: boolean;
  showBoundingBox?: boolean;
  showSparsePoints?: boolean;
  onToggleFloorGrid?: () => void;
  onToggleCameraPath?: () => void;
  onToggleBoundingBox?: () => void;
  onToggleSparsePoints?: () => void;
}

export function ViewerControls({
  showFloorGrid = false,
  showCameraPath = false,
  showBoundingBox = false,
  showSparsePoints = false,
  onToggleFloorGrid,
  onToggleCameraPath,
  onToggleBoundingBox,
  onToggleSparsePoints,
}: ViewerControlsProps) {
  return (
    <div className="viewer-controls">
      <label className="viewer-controls__toggle">
        <input
          type="checkbox"
          checked={showFloorGrid}
          onChange={onToggleFloorGrid}
        />
        Floor grid
      </label>
      <label className="viewer-controls__toggle">
        <input
          type="checkbox"
          checked={showCameraPath}
          onChange={onToggleCameraPath}
        />
        Camera path
      </label>
      <label className="viewer-controls__toggle">
        <input
          type="checkbox"
          checked={showBoundingBox}
          onChange={onToggleBoundingBox}
        />
        Bounding box
      </label>
      <label className="viewer-controls__toggle">
        <input
          type="checkbox"
          checked={showSparsePoints}
          onChange={onToggleSparsePoints}
        />
        Sparse points
      </label>
    </div>
  );
}
