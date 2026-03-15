import { useState, useEffect, useRef } from 'react';
import { getPipelineLogs } from '../../api/client.ts';
import './LogViewer.css';

interface LogViewerProps {
  sceneId: string;
  step: number;
  liveLines?: string[];
}

export function LogViewer({ sceneId, step, liveLines }: LogViewerProps) {
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setLoading(true);
    getPipelineLogs(sceneId, step)
      .then(setLogContent)
      .catch(() => setLogContent('Failed to load log.'))
      .finally(() => setLoading(false));
  }, [sceneId, step]);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logContent, liveLines]);

  const allLines = liveLines && liveLines.length > 0
    ? logContent + '\n' + liveLines.join('\n')
    : logContent;

  // Show last 200 lines
  const displayLines = allLines.split('\n').slice(-200).join('\n');

  return (
    <div className="log-viewer">
      <div className="log-viewer__header">
        <span>Step {step} Log</span>
        {loading && <span className="log-viewer__loading">Loading...</span>}
      </div>
      <pre ref={containerRef} className="log-viewer__content">
        {displayLines || (loading ? '' : 'No log output.')}
      </pre>
    </div>
  );
}
