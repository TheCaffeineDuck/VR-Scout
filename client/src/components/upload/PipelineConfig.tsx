import { useState } from 'react';
import type { PipelineConfig as PipelineConfigType } from '../../types/pipeline.ts';
import { DEFAULT_PIPELINE_CONFIG } from '../../utils/constants.ts';
import './PipelineConfig.css';

interface PipelineConfigProps {
  sceneId: string;
  uploadComplete: boolean;
  onStart: (config: PipelineConfigType) => void;
}

export function PipelineConfig({ sceneId, uploadComplete, onStart }: PipelineConfigProps) {
  const [config, setConfig] = useState<PipelineConfigType>({
    ...DEFAULT_PIPELINE_CONFIG,
  });

  const update = <K extends keyof PipelineConfigType>(
    key: K,
    value: PipelineConfigType[K],
  ) => {
    setConfig((c) => ({ ...c, [key]: value }));
  };

  const iterationWarning = config.training_iterations < 20000;

  return (
    <div className="pipeline-config">
      <h3>Pipeline Configuration</h3>

      <div className="pipeline-config__field">
        <label>Scene Name</label>
        <input
          type="text"
          className="input"
          value={sceneId}
          disabled
          title="Scene ID (auto-generated)"
        />
      </div>

      <div className="pipeline-config__field">
        <label>Camera Model</label>
        <select
          className="input"
          value={config.camera_model}
          onChange={(e) =>
            update('camera_model', e.target.value as 'SIMPLE_RADIAL' | 'OPENCV')
          }
        >
          <option value="SIMPLE_RADIAL">SIMPLE_RADIAL</option>
          <option value="OPENCV">OPENCV</option>
        </select>
      </div>

      <div className="pipeline-config__field">
        <label>Matcher</label>
        <select
          className="input"
          value={config.matcher}
          onChange={(e) =>
            update('matcher', e.target.value as 'exhaustive' | 'sequential')
          }
        >
          <option value="exhaustive">Exhaustive</option>
          <option value="sequential">Sequential</option>
        </select>
      </div>

      <div className="pipeline-config__field">
        <label>Training Iterations</label>
        <input
          type="number"
          className="input"
          min={7000}
          step={1000}
          value={config.training_iterations}
          onChange={(e) =>
            update('training_iterations', Math.max(7000, Number(e.target.value)))
          }
        />
        {iterationWarning && (
          <span className="pipeline-config__hint pipeline-config__hint--warn">
            Below 20K iterations may produce low quality results
          </span>
        )}
      </div>

      <div className="pipeline-config__field">
        <label>SH Degree</label>
        <select
          className="input"
          value={config.sh_degree}
          onChange={(e) =>
            update('sh_degree', Number(e.target.value) as 0 | 1 | 2 | 3)
          }
        >
          <option value={0}>0 (no view-dependent color)</option>
          <option value={1}>1 (diffuse — recommended)</option>
          <option value={2}>2 (moderate specular)</option>
          <option value={3}>3 (full specular)</option>
        </select>
      </div>

      <div className="pipeline-config__field">
        <label>Data Factor</label>
        <select
          className="input"
          value={config.data_factor}
          onChange={(e) =>
            update('data_factor', Number(e.target.value) as 1 | 2 | 4)
          }
        >
          <option value={1}>1 (full resolution)</option>
          <option value={2}>2 (half resolution)</option>
          <option value={4}>4 (quarter resolution)</option>
        </select>
      </div>

      <div className="pipeline-config__field">
        <label>Frame Extraction FPS</label>
        <select
          className="input"
          value={config.frame_fps}
          onChange={(e) =>
            update('frame_fps', Number(e.target.value) as 1 | 2 | 3)
          }
        >
          <option value={1}>1 FPS</option>
          <option value={2}>2 FPS (recommended)</option>
          <option value={3}>3 FPS</option>
        </select>
      </div>

      <div className="pipeline-config__field">
        <label>
          Scene Change Threshold: {config.scene_change_threshold.toFixed(2)}
        </label>
        <input
          type="range"
          className="input-range"
          min={0.05}
          max={0.3}
          step={0.01}
          value={config.scene_change_threshold}
          onChange={(e) =>
            update('scene_change_threshold', Number(e.target.value))
          }
        />
        <div className="pipeline-config__range-labels">
          <span>0.05 (more frames)</span>
          <span>0.30 (fewer frames)</span>
        </div>
      </div>

      <button
        className="btn btn--primary btn--large"
        disabled={!uploadComplete}
        onClick={() => onStart(config)}
      >
        {uploadComplete ? 'Start Processing' : 'Upload video first'}
      </button>
    </div>
  );
}
