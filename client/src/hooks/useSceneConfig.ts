import { useState } from 'react';
import type { SceneConfig } from '../types/scene';

interface UseSceneConfigResult {
  config: SceneConfig | null;
  loading: boolean;
}

export function useSceneConfig(_sceneId: string): UseSceneConfigResult {
  // TODO: Implement scene config fetching from /api/scenes/:sceneId
  const [config] = useState<SceneConfig | null>(null);
  const [loading] = useState(true);

  return { config, loading };
}
