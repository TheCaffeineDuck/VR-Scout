import { useState, useEffect, useCallback } from 'react';
import type { SceneListItem } from '../api/client.ts';
import { getScenes } from '../api/client.ts';

/** Global event target so all useScenes instances refresh together. */
const scenesEvents = new EventTarget();

/** Call this after any mutation (delete, create) to refresh all scene lists. */
export function refreshAllScenes(): void {
  scenesEvents.dispatchEvent(new Event('refresh'));
}

export interface UseScenesResult {
  scenes: SceneListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useScenes(): UseScenesResult {
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
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

  // Listen for global refresh events
  useEffect(() => {
    const handler = () => refresh();
    scenesEvents.addEventListener('refresh', handler);
    return () => scenesEvents.removeEventListener('refresh', handler);
  }, [refresh]);

  return { scenes, loading, error, refresh };
}
