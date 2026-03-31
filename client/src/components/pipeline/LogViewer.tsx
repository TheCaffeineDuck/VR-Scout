import { useState, useEffect, useRef } from 'react';
import { getPipelineLogs } from '../../api/pipeline';

interface LogViewerProps {
  sceneId: string;
  stepNum: number;
}

/** Scrollable log viewer for pipeline step output */
export function LogViewer({
  sceneId,
  stepNum,
}: LogViewerProps): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const result = await getPipelineLogs(sceneId, stepNum);
        if (!cancelled) {
          setLines(result.lines);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchLogs();

    // Poll every 3 seconds for live logs
    const interval = setInterval(() => void fetchLogs(), 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sceneId, stepNum]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="bg-gray-950 p-3 max-h-[300px] overflow-y-auto font-mono text-xs"
    >
      {loading && lines.length === 0 && (
        <p className="text-gray-500">Loading logs...</p>
      )}
      {!loading && lines.length === 0 && (
        <p className="text-gray-500">No log output yet</p>
      )}
      {lines.map((line, i) => (
        <div key={i} className="text-gray-400 whitespace-pre-wrap leading-5 hover:bg-gray-900">
          {line}
        </div>
      ))}
    </div>
  );
}
