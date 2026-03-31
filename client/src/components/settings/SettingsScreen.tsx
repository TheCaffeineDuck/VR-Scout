import { useState, useEffect } from 'react';
import type { HardwareProfile } from '../../types/metadata';
import { apiFetch } from '../../api/client';

/** Global default settings screen */
export function SettingsScreen(): React.JSX.Element {
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    apiFetch<HardwareProfile>('/settings/hardware')
      .then(setHardware)
      .catch(() => { /* no hardware info available */ });
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Hardware Profile */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Hardware Profile
        </h2>
        {hardware ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">GPU</span>
              <p className="text-white">{hardware.gpuName}</p>
            </div>
            <div>
              <span className="text-gray-500">VRAM</span>
              <p className="text-white">{hardware.gpuVramGb} GB</p>
            </div>
            <div>
              <span className="text-gray-500">Compute Capability</span>
              <p className="text-white">{hardware.computeCapability}</p>
            </div>
            <div>
              <span className="text-gray-500">CUDA Toolkit</span>
              <p className="text-white">{hardware.cudaToolkitVersion}</p>
            </div>
            <div>
              <span className="text-gray-500">Profile</span>
              <p className="text-white capitalize">{hardware.profile}</p>
            </div>
            <div>
              <span className="text-gray-500">SM Architecture</span>
              <p className="text-white">sm_{hardware.smArchitecture}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Hardware profile not available. Start the server with a CUDA-enabled GPU.
          </p>
        )}
      </div>

      {/* Theme */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Appearance
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={darkMode}
            onChange={(e) => setDarkMode(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          <span className="text-sm text-gray-300">Dark Mode</span>
        </label>
      </div>

      {/* Pipeline Defaults */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Pipeline Defaults
        </h2>
        <p className="text-sm text-gray-500">
          Default pipeline configuration can be adjusted per-scene during upload.
          Server-side defaults are configured in pipeline_defaults.json.
        </p>
      </div>
    </div>
  );
}
