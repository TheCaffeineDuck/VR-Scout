import { useState, useEffect, useCallback } from 'react';
import type { SceneListItem } from '../types/scene';
import { listScenes } from '../api/scenes';

interface UseScenesResult {
  scenes: SceneListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useScenes(): UseScenesResult {
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listScenes()
      .then((data) => {
        if (cancelled) return;
        setScenes(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load scenes');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  const refresh = useCallback(() => setFetchCount((c) => c + 1), []);

  return { scenes, loading, error, refresh };
}
