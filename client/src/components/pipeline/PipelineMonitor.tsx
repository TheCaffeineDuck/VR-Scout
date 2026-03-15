import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../../api/ws.ts';
import { cancelPipeline, resumePipeline, startPipeline } from '../../api/client.ts';
import { DEFAULT_PIPELINE_CONFIG } from '../../utils/constants.ts';
import { SceneNav } from '../layout/SceneNav.tsx';
import { StepList } from './StepList.tsx';
import { TrainingCharts } from './TrainingCharts.tsx';
import { ValidationReport } from './ValidationReport.tsx';
import { LogViewer } from './LogViewer.tsx';
import './PipelineMonitor.css';

export function PipelineMonitor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sceneId = id ?? '';

  // Single WebSocket connection for all pipeline data
  const { status, metrics, logLines, warnings, gpuStats, connected } = useWebSocket(sceneId);
  const [viewingLogStep, setViewingLogStep] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handleCancel = useCallback(async () => {
    try {
      setError(null);
      await cancelPipeline(sceneId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel pipeline';
      setError(msg);
    }
  }, [sceneId]);

  const handleProceed = useCallback(async () => {
    try {
      setError(null);
      await resumePipeline(sceneId, 7, DEFAULT_PIPELINE_CONFIG);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resume pipeline';
      setError(msg);
    }
  }, [sceneId]);

  const handleRerun = useCallback(async () => {
    try {
      setError(null);
      await resumePipeline(sceneId, 2, DEFAULT_PIPELINE_CONFIG);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rerun pipeline';
      setError(msg);
    }
  }, [sceneId]);

  const handleStart = useCallback(async () => {
    try {
      setError(null);
      await startPipeline(sceneId, DEFAULT_PIPELINE_CONFIG);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start pipeline';
      setError(msg);
    }
  }, [sceneId]);

  const isTraining = status?.current_step === 7 && status.status === 'running';
  const isAwaitingConfirmation = status?.status === 'awaiting_confirmation';
  // Pipeline is idle when there's no status at all (never run) or it finished/failed
  const isIdle = !status || status.status === 'completed' || status.status === 'failed';

  return (
    <div className="pipeline-monitor">
      <div className="pipeline-monitor__header">
        <div>
          <h2>Processing: {sceneId}</h2>
          <div className="pipeline-monitor__connection">
            <span
              className={`pipeline-monitor__dot ${connected ? 'pipeline-monitor__dot--connected' : ''}`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        {isIdle && (
          <button
            className="btn btn--primary"
            onClick={() => void handleStart()}
          >
            Start Processing
          </button>
        )}
      </div>

      <SceneNav />

      {error && (
        <div className="pipeline-monitor__warnings">
          <div className="pipeline-monitor__warning">{error}</div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="pipeline-monitor__warnings">
          {warnings.map((w, i) => (
            <div key={i} className="pipeline-monitor__warning">
              \u26A0\uFE0F {w}
            </div>
          ))}
        </div>
      )}

      <div className="pipeline-monitor__body">
        <div className="pipeline-monitor__steps">
          <StepList
            status={status}
            onViewLog={(step) => setViewingLogStep(step)}
          />
        </div>

        <div className="pipeline-monitor__detail">
          {isTraining && (
            <TrainingCharts metrics={metrics} gpuStats={gpuStats} />
          )}

          {isAwaitingConfirmation && (
            <ValidationReport
              sceneId={sceneId}
              onProceed={() => void handleProceed()}
              onRerun={() => void handleRerun()}
            />
          )}

          {status?.status === 'awaiting_review' && (
            <div className="pipeline-monitor__review-prompt">
              <h4>Pipeline Complete</h4>
              <p>Open QA Review to verify alignment and visual quality.</p>
              <button
                className="btn btn--primary"
                onClick={() => void navigate(`/scene/${sceneId}/review`)}
              >
                Open QA Review
              </button>
            </div>
          )}

          {viewingLogStep != null && (
            <LogViewer
              sceneId={sceneId}
              step={viewingLogStep}
              liveLines={
                viewingLogStep === status?.current_step ? logLines : undefined
              }
            />
          )}
        </div>
      </div>

      <div className="pipeline-monitor__footer">
        <button
          className="btn btn--danger"
          disabled={!status || status.status !== 'running'}
          onClick={() => void handleCancel()}
        >
          Cancel Pipeline
        </button>
      </div>
    </div>
  );
}
