interface LogViewerProps {
  sceneId: string;
  stepNum: number;
}

/** Scrollable log viewer for pipeline step output */
export function LogViewer({
  sceneId,
  stepNum,
}: LogViewerProps): React.JSX.Element {
  // TODO: Implement streaming log viewer with auto-scroll
  return (
    <div className="log-viewer">
      <p>TODO: Logs for scene {sceneId}, step {stepNum}</p>
    </div>
  );
}
