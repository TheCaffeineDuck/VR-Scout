import { useState } from 'react';
import { updateAlignment } from '../../api/client.ts';
import './FloorPlaneAdjuster.css';

interface FloorPlaneAdjusterProps {
  sceneId: string;
  onApply?: () => void;
}

export function FloorPlaneAdjuster({ sceneId, onApply }: FloorPlaneAdjusterProps) {
  const [yOffset, setYOffset] = useState(0);
  const [yRotation, setYRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = () => {
    setYOffset(0);
    setYRotation(0);
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
        <button className="btn btn--ghost" onClick={handleReset}>
          Reset
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
