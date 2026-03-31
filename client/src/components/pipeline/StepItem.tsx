import type { StepStatus } from '../../types/pipeline';

interface StepItemProps {
  step: StepStatus;
}

/** Single pipeline step with status indicator */
export function StepItem({ step }: StepItemProps): React.JSX.Element {
  // TODO: Implement step display with status icon and expandable logs
  return (
    <div className="step-item">
      <span>Step {step.stepNum}: {step.stepName}</span>
      <span>{step.status}</span>
    </div>
  );
}
