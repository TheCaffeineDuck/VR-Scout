import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ValidationReport as ValidationReportType } from '../../types/pipeline';
import { usePipelineStatus } from '../../hooks/usePipelineStatus';
import { useTrainingMetrics } from '../../hooks/useTrainingMetrics';
import { cancelPipeline, confirmPipeline, getValidation } from '../../api/pipeline';
import { StepItem } from './StepItem';
import { TrainingMetricsPanel } from './TrainingMetricsPanel';
import { ValidationReport } from './ValidationReport';
import { DepthProgress } from './DepthProgress';
import { PruningProgress } from './PruningProgress';

/** Pipeline monitoring screen with step list and metrics */
export function PipelineMonitor(): React.JSX.Element {
  const { sceneId } = useParams<{ sceneId: string }>();
  const navigate = useNavigate();
  const { steps, currentStep, connected, lastMessage } = usePipelineStatus(sceneId ?? '');
  const { metrics } = useTrainingMetrics(sceneId ?? '', lastMessage);
  const [validation, setValidation] = useState<ValidationReportType | null>(null);
  const [depthProgress, setDepthProgress] = useState<{ completed: number; total: number } | null>(null);
  const [pruningProgress, setPruningProgress] = useState<{ currentCount: number; targetCount: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Handle WS messages for depth and pruning progress
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'depth_progress') {
      setDepthProgress(lastMessage.data);
    } else if (lastMessage.type === 'pruning_progress') {
      setPruningProgress(lastMessage.data);
    }
  }, [lastMessage]);

  // Fetch validation when a validation step completes
  useEffect(() => {
    if (!sceneId) return;
    const validationStep = steps.find(
      (s) => s.stepName.toLowerCase().includes('validation') && (s.status === 'complete' || s.status === 'completed' || s.status === 'waiting'),
    );
    if (validationStep) {
      getValidation(sceneId)
        .then(setValidation)
        .catch(() => { /* not ready yet */ });
    }
  }, [sceneId, steps]);

  const handleCancel = useCallback(async () => {
    if (!sceneId) return;
    setCancelling(true);
    try {
      await cancelPipeline(sceneId);
    } catch {
      // ignore
    }
    setCancelling(false);
  }, [sceneId]);

  const handleConfirm = useCallback(async () => {
    if (!sceneId) return;
    try {
      await confirmPipeline(sceneId);
    } catch {
      // ignore
    }
  }, [sceneId]);

  // Check if pipeline is complete
  const isComplete = steps.length > 0 && steps.every(
    (s) => s.status === 'complete' || s.status === 'completed' || s.status === 'skipped',
  );

  if (!sceneId) {
    return <div className="p-6 text-gray-400">No scene selected</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipeline Monitor</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-gray-500">Scene: {sceneId}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
              {connected ? 'Live' : 'Disconnected'}
            </span>
            {currentStep !== null && (
              <span className="text-xs text-blue-400">Step {currentStep}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isComplete && (
            <button
              onClick={() => navigate(`/review/${sceneId}`)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
            >
              Review
            </button>
          )}
          <button
            onClick={() => void handleCancel()}
            disabled={cancelling || isComplete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step list */}
        <div className="lg:col-span-2 space-y-2">
          {steps.length === 0 ? (
            <div className="text-gray-500 bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
              Waiting for pipeline steps...
            </div>
          ) : (
            steps.map((step) => (
              <StepItem key={step.stepNum} step={step} sceneId={sceneId} />
            ))
          )}
        </div>

        {/* Right panel: metrics and progress */}
        <div className="space-y-4">
          <TrainingMetricsPanel metrics={metrics} />

          {validation && (
            <ValidationReport report={validation} onConfirm={() => void handleConfirm()} />
          )}

          {depthProgress && (
            <DepthProgress completed={depthProgress.completed} total={depthProgress.total} />
          )}

          {pruningProgress && (
            <PruningProgress currentCount={pruningProgress.currentCount} targetCount={pruningProgress.targetCount} />
          )}
        </div>
      </div>
    </div>
  );
}
