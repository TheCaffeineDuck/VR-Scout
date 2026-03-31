import type { PipelineConfig } from '../../types/pipeline';

interface PipelineConfigPanelProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
}

/** Configuration panel for pipeline settings */
export function PipelineConfigPanel({
  config,
  onChange,
}: PipelineConfigPanelProps): React.JSX.Element {
  // TODO: Implement pipeline configuration form with all settings
  void onChange;
  return (
    <div className="pipeline-config-panel">
      <h2>Pipeline Configuration</h2>
      <p>TODO: Camera model: {config.cameraModel}</p>
    </div>
  );
}
