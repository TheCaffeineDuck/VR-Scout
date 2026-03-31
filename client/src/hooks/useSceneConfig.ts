import { useState, useEffect } from 'react';
import type { SceneConfig } from '../types/scene';
import { getSceneConfig } from '../api/scenes';

interface UseSceneConfigResult {
  config: SceneConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSceneConfig(sceneId: string): UseSceneConfigResult {
  const [config, setConfig] = useState<SceneConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    if (!sceneId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getSceneConfig(sceneId)
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load scene config');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sceneId, fetchCount]);

  const refetch = () => setFetchCount((c) => c + 1);

  return { config, loading, error, refetch };
}
