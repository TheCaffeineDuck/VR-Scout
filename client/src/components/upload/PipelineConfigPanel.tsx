import type { PipelineConfig } from '../../types/pipeline';

interface PipelineConfigPanelProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400">{label}</span>
      <select
        className="mt-1 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const numVal = Number(raw);
          const parsed = (isNaN(numVal) ? raw : numVal) as T;
          onChange(parsed);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400">{label}</span>
      <input
        type="number"
        className="mt-1 block w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-600"
      />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}

/** Configuration panel for pipeline settings */
export function PipelineConfigPanel({
  config,
  onChange,
}: PipelineConfigPanelProps): React.JSX.Element {
  const update = <K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Pipeline Configuration
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          label="Camera Model"
          value={config.cameraModel}
          options={[
            { value: 'SIMPLE_RADIAL', label: 'Simple Radial' },
            { value: 'OPENCV', label: 'OpenCV' },
          ]}
          onChange={(v) => update('cameraModel', v as PipelineConfig['cameraModel'])}
        />

        <SelectField
          label="Matcher"
          value={config.matcher}
          options={[
            { value: 'exhaustive', label: 'Exhaustive' },
            { value: 'sequential', label: 'Sequential' },
            { value: 'spatial', label: 'Spatial' },
          ]}
          onChange={(v) => update('matcher', v as PipelineConfig['matcher'])}
        />

        <NumberField
          label="Training Iterations"
          value={config.trainingIterations}
          onChange={(v) => update('trainingIterations', v)}
          min={1000}
          max={100000}
          step={1000}
        />

        <SelectField
          label="SH Degree"
          value={config.shDegree}
          options={[
            { value: 0, label: '0' },
            { value: 1, label: '1' },
            { value: 2, label: '2' },
            { value: 3, label: '3' },
          ]}
          onChange={(v) => update('shDegree', v as PipelineConfig['shDegree'])}
        />

        <SelectField
          label="Data Factor"
          value={config.dataFactor}
          options={[
            { value: 1, label: '1x (full res)' },
            { value: 2, label: '2x' },
            { value: 4, label: '4x' },
          ]}
          onChange={(v) => update('dataFactor', v as PipelineConfig['dataFactor'])}
        />

        <SelectField
          label="Frame FPS"
          value={config.frameFps}
          options={[
            { value: 1, label: '1 FPS' },
            { value: 2, label: '2 FPS' },
            { value: 3, label: '3 FPS' },
          ]}
          onChange={(v) => update('frameFps', v as PipelineConfig['frameFps'])}
        />

        <NumberField
          label="Scene Change Threshold"
          value={config.sceneChangeThreshold}
          onChange={(v) => update('sceneChangeThreshold', v)}
          min={0}
          max={1}
          step={0.01}
        />

        <SelectField
          label="Depth Model Size"
          value={config.depthModelSize}
          options={[
            { value: 'Small', label: 'Small' },
            { value: 'Base', label: 'Base' },
            { value: 'Large', label: 'Large' },
          ]}
          onChange={(v) => update('depthModelSize', v as PipelineConfig['depthModelSize'])}
        />

        <SelectField
          label="Segmentation"
          value={config.segmentation}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Auto' },
          ]}
          onChange={(v) => update('segmentation', v as PipelineConfig['segmentation'])}
        />

        <NumberField
          label="Quest Gaussian Budget"
          value={config.questGaussianBudget}
          onChange={(v) => update('questGaussianBudget', v)}
          min={50000}
          max={5000000}
          step={50000}
        />

        <NumberField
          label="Desktop Gaussian Budget"
          value={config.desktopGaussianBudget}
          onChange={(v) => update('desktopGaussianBudget', v)}
          min={100000}
          max={10000000}
          step={100000}
        />
      </div>

      <div className="space-y-2 pt-2">
        <CheckboxField
          label="Depth Estimation"
          checked={config.depthEstimation}
          onChange={(v) => update('depthEstimation', v)}
        />
        <CheckboxField
          label="Perceptual Pruning"
          checked={config.perceptualPruning}
          onChange={(v) => update('perceptualPruning', v)}
        />
      </div>
    </div>
  );
}
