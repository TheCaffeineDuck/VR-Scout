import { useState } from 'react';
import type { PipelineStatus } from '../../types/pipeline.ts';
import { formatDuration } from '../../utils/format.ts';
import './StepItem.css';

interface StepItemProps {
  stepNumber: number;
  name: string;
  status: PipelineStatus | 'pending';
  elapsedSeconds?: number;
  summary?: string;
  errorMessage?: string;
  onViewLog?: () => void;
}

function statusIconFor(status: PipelineStatus | 'pending'): string {
  switch (status) {
    case 'completed':
      return '\u2705';
    case 'running':
      return '\u{1F504}';
    case 'failed':
      return '\u274C';
    case 'warning':
      return '\u26A0\uFE0F';
    case 'blocked':
      return '\u{1F6D1}';
    case 'awaiting_confirmation':
    case 'awaiting_review':
      return '\u23F8\uFE0F';
    case 'pending':
    default:
      return '\u2B1C';
  }
}

export function StepItem({
  stepNumber,
  name,
  status,
  elapsedSeconds,
  summary,
  errorMessage,
  onViewLog,
}: StepItemProps) {
  const [expanded, setExpanded] = useState(status === 'failed');

  return (
    <div
      className={`step-item step-item--${status}`}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="step-item__row">
        <span className={`step-item__icon ${status === 'running' ? 'step-item__icon--spin' : ''}`}>
          {statusIconFor(status)}
        </span>
        <span className="step-item__number">{stepNumber}.</span>
        <span className="step-item__name">{name}</span>
        <span className="step-item__time">
          {elapsedSeconds != null ? formatDuration(elapsedSeconds) : '\u2014'}
        </span>
        <span className="step-item__summary">{summary ?? ''}</span>
      </div>

      {expanded && (status === 'failed' || status === 'completed') && (
        <div className="step-item__details">
          {errorMessage && (
            <div className="step-item__error">{errorMessage}</div>
          )}
          {onViewLog && (
            <button
              className="btn btn--small btn--ghost"
              onClick={(e) => {
                e.stopPropagation();
                onViewLog();
              }}
            >
              View Log
            </button>
          )}
        </div>
      )}
    </div>
  );
}
