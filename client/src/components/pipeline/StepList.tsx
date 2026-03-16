import type { StatusFile } from '../../types/pipeline.ts';
import { PIPELINE_STEPS } from '../../utils/constants.ts';
import { StepItem } from './StepItem.tsx';
import './StepList.css';

interface StepListProps {
  status: StatusFile | null;
  onViewLog: (step: number) => void;
  onResume: (step: number) => void;
}

export function StepList({ status, onViewLog, onResume }: StepListProps) {
  return (
    <div className="step-list">
      {PIPELINE_STEPS.map((step) => {
        let stepStatus: 'pending' | 'completed' | 'running' | 'failed' | 'warning' | 'blocked' | 'awaiting_confirmation' | 'awaiting_review' = 'pending';

        if (status) {
          if (step.number < status.current_step) {
            stepStatus = 'completed';
          } else if (step.number === status.current_step) {
            stepStatus = status.status;
          }
        }

        return (
          <StepItem
            key={step.number}
            stepNumber={step.number}
            name={step.name}
            status={stepStatus}
            summary={
              step.number === status?.current_step ? status.message : undefined
            }
            errorMessage={
              stepStatus === 'failed' ? status?.message : undefined
            }
            onViewLog={() => onViewLog(step.number)}
            onResume={
              stepStatus === 'completed' || stepStatus === 'failed'
                ? () => onResume(step.number)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
