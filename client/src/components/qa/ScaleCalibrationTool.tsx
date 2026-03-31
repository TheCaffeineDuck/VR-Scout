import { useState, useCallback } from 'react';
import { updateScale } from '../../api/scenes';

interface ScaleCalibrationToolProps {
  sceneId: string;
}

/** Click two points in 3D view and enter known distance for scale calibration */
export function ScaleCalibrationTool({ sceneId }: ScaleCalibrationToolProps): React.JSX.Element {
  const [distance, setDistance] = useState(1.0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateScale(sceneId, { metersPerUnit: distance });
      setSaved(true);
    } catch {
      // handle error
    }
    setSaving(false);
  }, [sceneId, distance]);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Scale Calibration
      </h3>

      <p className="text-xs text-gray-500">
        Click two points in the viewer and enter the known real-world distance between them.
      </p>

      <label className="block">
        <span className="text-sm text-gray-400">Known distance (meters)</span>
        <input
          type="number"
          step={0.01}
          min={0.01}
          value={distance}
          onChange={(e) => {
            setDistance(Number(e.target.value));
            setSaved(false);
          }}
          className="mt-1 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          {saving ? 'Saving...' : 'Apply Scale'}
        </button>
        {saved && <span className="text-xs text-green-400">Saved</span>}
      </div>
    </div>
  );
}
