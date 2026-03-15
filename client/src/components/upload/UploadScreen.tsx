import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PipelineConfig as PipelineConfigType } from '../../types/pipeline.ts';
import { startPipeline } from '../../api/client.ts';
import { UploadPanel } from './UploadPanel.tsx';
import { PipelineConfig } from './PipelineConfig.tsx';
import './UploadScreen.css';

export function UploadScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sceneId = id ?? '';

  const [uploadComplete, setUploadComplete] = useState(false);

  const handleStart = useCallback(
    async (config: PipelineConfigType) => {
      try {
        await startPipeline(sceneId, config);
        void navigate(`/scene/${sceneId}/pipeline`);
      } catch {
        // Error handling in production
      }
    },
    [sceneId, navigate],
  );

  return (
    <div className="upload-screen">
      <h2>New Scene: {sceneId}</h2>
      <div className="upload-screen__panels">
        <UploadPanel
          sceneId={sceneId}
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
