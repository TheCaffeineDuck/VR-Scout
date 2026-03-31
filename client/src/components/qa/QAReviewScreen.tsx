import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSceneConfig } from '../../hooks/useSceneConfig';
import { ScenePreview } from './ScenePreview';
import { AlignmentControls } from './AlignmentControls';
import { ExportActions } from './ExportActions';
import { DesktopQuestToggle } from './DesktopQuestToggle';
import { BoundingBoxCropEditor } from './BoundingBoxCropEditor';
import { ScaleCalibrationTool } from './ScaleCalibrationTool';
import { FlythroughVideoPlayer } from './FlythroughVideoPlayer';
import { CameraPathViewer } from './CameraPathViewer';

/** QA review screen with 3D viewer and control panels */
export function QAReviewScreen(): React.JSX.Element {
  const { sceneId } = useParams<{ sceneId: string }>();
  const { config, loading, error } = useSceneConfig(sceneId ?? '');
  const [viewerMode, setViewerMode] = useState<'desktop' | 'quest'>('desktop');

  if (!sceneId) {
    return <div className="p-6 text-gray-400">No scene selected</div>;
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading scene...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: 3D viewer (70%) */}
      <div className="flex-[7] p-4">
        <ScenePreview />
      </div>

      {/* Right: controls (30%) */}
      <div className="flex-[3] p-4 overflow-y-auto border-l border-gray-800 space-y-4">
        <h1 className="text-xl font-bold text-white">{config?.name ?? 'QA Review'}</h1>

        <DesktopQuestToggle
          mode={viewerMode}
          onChange={setViewerMode}
          gaussianCount={config?.gaussianCount}
        />

        <AlignmentControls sceneId={sceneId} />
        <BoundingBoxCropEditor sceneId={sceneId} />
        <ScaleCalibrationTool sceneId={sceneId} />
        <FlythroughVideoPlayer url={config?.flythroughVideoUrl} />
        <CameraPathViewer />
        <ExportActions config={config} />
      </div>
    </div>
  );
}
