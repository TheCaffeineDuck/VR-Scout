import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineConfig as PipelineConfigType } from '../../types/pipeline.ts';
import { startPipeline } from '../../api/client.ts';
import { SceneNav } from '../layout/SceneNav.tsx';
import { UploadPanel } from './UploadPanel.tsx';
import { PipelineConfig } from './PipelineConfig.tsx';
import './UploadScreen.css';

export function UploadScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Scene ID may come from URL (re-upload) or be set when file is selected (new upload)
  const [sceneId, setSceneId] = useState(id ?? '');
  const [uploadComplete, setUploadComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(
    async (config: PipelineConfigType) => {
      if (!sceneId) return;
      try {
        setError(null);
        await startPipeline(sceneId, config);
        void navigate(`/scene/${sceneId}/pipeline`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to start pipeline';
        setError(msg);
      }
    },
    [sceneId, navigate],
  );

  return (
    <div className="upload-screen">
      <h2>{id ? `Upload: ${sceneId}` : 'New Scene'}</h2>
      {id && <SceneNav />}
      {error && <div className="upload-screen__error">{error}</div>}
      <div className="upload-screen__panels">
        <UploadPanel
          sceneId={sceneId}
          isExistingScene={id != null}
          onSceneIdResolved={(resolvedId) => setSceneId(resolvedId)}
          onUploadComplete={() => setUploadComplete(true)}
        />
        <PipelineConfig
          sceneId={sceneId}
          uploadComplete={uploadComplete}
          onStart={(config) => void handleStart(config)}
        />
      </div>
    </div>
  );
}
