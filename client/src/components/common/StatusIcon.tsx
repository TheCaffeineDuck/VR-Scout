interface StatusIconProps {
  status: string;
}

/** Status indicator icon (pending, running, complete, error) */
export function StatusIcon({ status }: StatusIconProps): React.JSX.Element {
  // TODO: Implement status-based icon with appropriate colors
  return (
    <span className="status-icon" data-status={status}>
      {status}
    </span>
  );
}
