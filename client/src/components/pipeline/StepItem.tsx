import { useState } from 'react';
import type { StepStatus } from '../../types/pipeline';
import { StatusIcon } from '../common/StatusIcon';
import { LogViewer } from './LogViewer';

interface StepItemProps {
  step: StepStatus;
  sceneId: string;
}

/** Single pipeline step with status indicator */
export function StepItem({ step, sceneId }: StepItemProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={step.status} />
        <span className="text-sm font-medium text-white flex-1">
          Step {step.stepNum}: {step.stepName}
        </span>
        <span className="text-xs text-gray-500 capitalize">{step.status}</span>
        {step.message && (
          <span className="text-xs text-gray-500 truncate max-w-[200px]">{step.message}</span>
        )}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-700">
          <LogViewer sceneId={sceneId} stepNum={step.stepNum} />
        </div>
      )}
    </div>
  );
}
