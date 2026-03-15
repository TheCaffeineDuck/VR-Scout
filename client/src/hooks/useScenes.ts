import { useState, useEffect, useCallback } from 'react';
import type { SceneConfig } from '../types/scene.ts';
import { getScenes } from '../api/client.ts';

export interface UseScenesResult {
  scenes: SceneConfig[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useScenes(): UseScenesResult {
  const [scenes, setScenes] = useState<SceneConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    getScenes()
      .then(setScenes)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load scenes');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { scenes, loading, error, refresh };
}
