import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../../api/ws.ts';
import { cancelPipeline, getSceneMetadata, resumePipeline, startPipeline } from '../../api/client.ts';
import type { SceneMetadata } from '../../types/pipeline.ts';
import { DEFAULT_PIPELINE_CONFIG } from '../../utils/constants.ts';
import { SceneNav } from '../layout/SceneNav.tsx';
import { StepList } from './StepList.tsx';
import { TrainingCharts } from './TrainingCharts.tsx';
import { ValidationReport } from './ValidationReport.tsx';
import { LogViewer } from './LogViewer.tsx';
import './PipelineMonitor.css';

// Lazy-load the 3D viewer to avoid loading Three.js until needed
const SparseCloudViewer = lazy(() =>
  import('./SparseCloudViewer.tsx').then((m) => ({ default: m.SparseCloudViewer })),
);

/** Build a one-line metadata summary for the info banner. */
function buildMetadataSummary(meta: SceneMetadata): string {
  const parts: string[] = [];

  // Camera identification
  const camera = [meta.container.camera_make, meta.container.camera_model]
    .filter(Boolean)
    .join(' ');
  parts.push(camera || 'Unknown camera');

  // SRT data availability
  if (meta.srt?.available) {
    const dataTypes: string[] = [];
    if (meta.srt.has_gps) dataTypes.push('GPS');
    if (meta.srt.has_gimbal) dataTypes.push('Gimbal');
    parts.push(dataTypes.length > 0 ? dataTypes.join(' + ') : 'SRT parsed');

    if (meta.frame_matching) {
      parts.push(`${meta.frame_matching.total_frames} frames matched`);
    }
  } else {
    parts.push('No telemetry file');
  }

  // Alignment strategy
  switch (meta.alignment_strategy) {
    case 'geo_registration':
      parts.push('geo-registration enabled');
      break;
    case 'gimbal_gravity':
      parts.push('gravity prior enabled');
      break;
    case 'manhattan':
      parts.push('Manhattan alignment');
      break;
  }

  return parts.join(' \u00B7 ');
}

export function PipelineMonitor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sceneId = id ?? '';

  // Single WebSocket connection for all pipeline data
  const { status, metrics, logLines, warnings, gpuStats, connected } = useWebSocket(sceneId);
  const [viewingLogStep, setViewingLogStep] = useState<number | null>(null);
  const [sparseViewerOpen, setSparseViewerOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Scene metadata (fetched after step 1 completes)
  const [metadata, setMetadata] = useState<SceneMetadata | null>(null);

  // Fetch metadata once pipeline is past step 1
  const pastStep1 = status != null && status.current_step > 1;
  useEffect(() => {
    if (!pastStep1 || metadata) return;
    getSceneMetadata(sceneId)
      .then(setMetadata)
      .catch(() => {
        // Metadata may not exist — that's fine
      });
  }, [pastStep1, sceneId, metadata]);

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

  // Sparse cloud viewer: available after step 4 (mapping), hidden once training starts (step 7+)
  const mappingDone = status != null && status.current_step > 4;
  const alignmentDone = status != null && status.current_step > 5;
  const trainingStarted = status != null && status.current_step >= 7;
  const showViewerButton = mappingDone && !trainingStarted;
  const sparseViewerMode = alignmentDone ? 'comparison' as const : 'single' as const;

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
              {'\u26A0\uFE0F'} {w}
            </div>
          ))}
        </div>
      )}

      {/* Metadata info banner — shown after step 1 completes */}
      {metadata && pastStep1 && (
        <div className="pipeline-monitor__metadata-banner">
          <span className="pipeline-monitor__metadata-label">Metadata:</span>
          {' '}
          {buildMetadataSummary(metadata)}
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

      {/* Sparse cloud viewer panel */}
      {showViewerButton && (
        <div className="pipeline-monitor__viewer-section">
          {!sparseViewerOpen ? (
            <button
              className="btn btn--ghost"
              onClick={() => setSparseViewerOpen(true)}
            >
              {alignmentDone ? 'Compare Alignment' : 'Preview Reconstruction'}
            </button>
          ) : (
            <div className="pipeline-monitor__viewer-panel">
              <div className="pipeline-monitor__viewer-bar">
                <span className="pipeline-monitor__viewer-title">
                  {sparseViewerMode === 'comparison' ? 'Alignment Comparison' : 'Sparse Reconstruction'}
                </span>
                <button
                  className="btn btn--small btn--ghost"
                  onClick={() => setSparseViewerOpen(false)}
                >
                  Close
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="pipeline-monitor__viewer-loading">Loading viewer...</div>
                }
              >
                <SparseCloudViewer sceneId={sceneId} mode={sparseViewerMode} />
              </Suspense>
            </div>
          )}
        </div>
      )}

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
