import { useState } from 'react';
import { updateAlignment } from '../../api/client.ts';
import './FloorPlaneAdjuster.css';

interface FloorPlaneAdjusterProps {
  sceneId: string;
  showFloorGrid?: boolean;
  onToggleFloorGrid?: () => void;
  yOffset?: number;
  yRotation?: number;
  onYOffsetChange?: (value: number) => void;
  onYRotationChange?: (value: number) => void;
  onApply?: () => void;
}

export function FloorPlaneAdjuster({
  sceneId,
  showFloorGrid = false,
  onToggleFloorGrid,
  yOffset: controlledYOffset,
  yRotation: controlledYRotation,
  onYOffsetChange,
  onYRotationChange,
  onApply,
}: FloorPlaneAdjusterProps) {
  const [internalYOffset, setInternalYOffset] = useState(0);
  const [internalYRotation, setInternalYRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Support both controlled and uncontrolled modes
  const yOffset = controlledYOffset ?? internalYOffset;
  const yRotation = controlledYRotation ?? internalYRotation;

  const setYOffset = (value: number) => {
    if (onYOffsetChange) {
      onYOffsetChange(value);
    } else {
      setInternalYOffset(value);
    }
  };

  const setYRotation = (value: number) => {
    if (onYRotationChange) {
      onYRotationChange(value);
    } else {
      setInternalYRotation(value);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAlignment(sceneId, { y_offset: 0, y_rotation: 0 });
      setYOffset(0);
      setYRotation(0);
      onApply?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset alignment');
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAlignment(sceneId, { y_offset: yOffset, y_rotation: yRotation });
      onApply?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update alignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="floor-adjuster">
      <h4>Alignment</h4>

      <label className="floor-adjuster__toggle">
        <input
          type="checkbox"
          checked={showFloorGrid}
          onChange={onToggleFloorGrid}
        />
        Show Floor Grid
      </label>

      <div className="floor-adjuster__field">
        <label>Y Offset (meters)</label>
        <input
          type="number"
          className="input"
          step={0.01}
          value={yOffset}
          onChange={(e) => setYOffset(Number(e.target.value))}
        />
      </div>

      <div className="floor-adjuster__field">
        <label>Y Rotation (degrees)</label>
        <input
          type="number"
          className="input"
          step={1}
          value={yRotation}
          onChange={(e) => setYRotation(Number(e.target.value))}
        />
      </div>

      {error && <div className="floor-adjuster__error">{error}</div>}

      <div className="floor-adjuster__actions">
        <button className="btn btn--ghost" disabled={saving} onClick={() => void handleReset()}>
          {saving ? 'Resetting...' : 'Reset'}
        </button>
        <button
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void handleApply()}
        >
          {saving ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </div>
  );
}
