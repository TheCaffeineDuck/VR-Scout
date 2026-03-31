import { useState, useCallback } from 'react';
import { updateAlignment } from '../../api/scenes';

interface AlignmentControlsProps {
  sceneId: string;
}

/** Floor grid alignment controls with Y offset and rotation */
export function AlignmentControls({ sceneId }: AlignmentControlsProps): React.JSX.Element {
  const [yOffset, setYOffset] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateAlignment(sceneId, {
        transform: [1, 0, 0, 0, 0, 1, 0, yOffset, 0, 0, 1, 0, 0, 0, 0, 1],
        floorY: yOffset,
      });
      setSaved(true);
    } catch {
      // handle error
    }
    setSaving(false);
  }, [sceneId, yOffset]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Alignment
      </h3>

      <label className="block">
        <span className="text-sm text-gray-400">Y Offset (meters)</span>
        <input
          type="number"
          step={0.01}
          value={yOffset}
          onChange={(e) => setYOffset(Number(e.target.value))}
          className="mt-1 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm text-gray-400">Rotation (degrees)</span>
        <input
          type="number"
          step={1}
          value={rotation}
          onChange={(e) => setRotation(Number(e.target.value))}
          className="mt-1 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          {saving ? 'Saving...' : 'Apply'}
        </button>
        {saved && <span className="text-xs text-green-400">Saved</span>}
      </div>

      <p className="text-xs text-gray-600">
        Rotation: {rotation} degrees
      </p>
    </div>
  );
}
