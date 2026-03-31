import { useState, useCallback } from 'react';
import { updateCrop } from '../../api/scenes';
import type { CropBounds } from '../../api/scenes';

interface BoundingBoxCropEditorProps {
  sceneId: string;
}

const DEFAULT_BOUNDS: CropBounds = {
  minX: -10,
  minY: -10,
  minZ: -10,
  maxX: 10,
  maxY: 10,
  maxZ: 10,
};

/** 3D draggable bounding box for cropping scene content */
export function BoundingBoxCropEditor({ sceneId }: BoundingBoxCropEditorProps): React.JSX.Element {
  const [bounds, setBounds] = useState<CropBounds>(DEFAULT_BOUNDS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (key: keyof CropBounds, value: number) => {
    setBounds((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateCrop(sceneId, bounds);
      setSaved(true);
    } catch {
      // handle error
    }
    setSaving(false);
  }, [sceneId, bounds]);

  const fields: { key: keyof CropBounds; label: string }[] = [
    { key: 'minX', label: 'Min X' },
    { key: 'maxX', label: 'Max X' },
    { key: 'minY', label: 'Min Y' },
    { key: 'maxY', label: 'Max Y' },
    { key: 'minZ', label: 'Min Z' },
    { key: 'maxZ', label: 'Max Z' },
  ];

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Crop Bounds
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {fields.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="text-xs text-gray-500">{label}</span>
            <input
              type="number"
              step={0.5}
              value={bounds[key]}
              onChange={(e) => handleChange(key, Number(e.target.value))}
              className="mt-0.5 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          {saving ? 'Saving...' : 'Apply Crop'}
        </button>
        {saved && <span className="text-xs text-green-400">Saved</span>}
      </div>
    </div>
  );
}
