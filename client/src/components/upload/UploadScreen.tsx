import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PipelineConfig } from '../../types/pipeline';
import { createScene } from '../../api/scenes';
import { startPipeline } from '../../api/pipeline';
import { VideoDropZone } from './VideoDropZone';
import { SupplementaryFiles } from './SupplementaryFiles';
import { PipelineConfigPanel } from './PipelineConfigPanel';

const DEFAULT_CONFIG: PipelineConfig = {
  cameraModel: 'SIMPLE_RADIAL',
  matcher: 'sequential',
  trainingIterations: 30000,
  shDegree: 3,
  dataFactor: 1,
  frameFps: 2,
  sceneChangeThreshold: 0.3,
  depthEstimation: true,
  depthModelSize: 'Base',
  segmentation: 'auto',
  perceptualPruning: true,
  questGaussianBudget: 500000,
  desktopGaussianBudget: 2000000,
};

/** Upload screen with video drop zone, supplementary files, and pipeline config */
export function UploadScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const [sceneName, setSceneName] = useState('');
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [config, setConfig] = useState<PipelineConfig>(DEFAULT_CONFIG);
  const [videoUploaded, setVideoUploaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateScene = useCallback(async () => {
    if (!sceneName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createScene(sceneName.trim());
      setSceneId(result.sceneId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create scene');
    } finally {
      setCreating(false);
    }
  }, [sceneName]);

  const handleStartPipeline = useCallback(async () => {
    if (!sceneId) return;
    setStarting(true);
    setError(null);
    try {
      await startPipeline(sceneId, config);
      navigate(`/pipeline/${sceneId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start pipeline');
      setStarting(false);
    }
  }, [sceneId, config, navigate]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">New Scene Upload</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Scene Name */}
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-1">Scene Name</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="My Scene"
            disabled={!!sceneId}
            className="flex-1 bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 disabled:opacity-50"
          />
          {!sceneId && (
            <button
              onClick={() => void handleCreateScene()}
              disabled={!sceneName.trim() || creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          )}
          {sceneId && (
            <span className="px-3 py-2 text-green-400 text-sm self-center">Created</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: uploads */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">Video</h2>
            <VideoDropZone
              sceneId={sceneId}
              onUploadComplete={() => setVideoUploaded(true)}
            />
          </div>

          <SupplementaryFiles sceneId={sceneId} />
        </div>

        {/* Right column: config */}
        <div>
          <PipelineConfigPanel config={config} onChange={setConfig} />
        </div>
      </div>

      {/* Start button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={() => void handleStartPipeline()}
          disabled={!sceneId || !videoUploaded || starting}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-lg transition-colors"
        >
          {starting ? 'Starting Pipeline...' : 'Start Pipeline'}
        </button>
      </div>
    </div>
  );
}
