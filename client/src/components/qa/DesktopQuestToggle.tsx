import type { GaussianCount } from '../../types/scene';

interface DesktopQuestToggleProps {
  mode: 'desktop' | 'quest';
  onChange: (mode: 'desktop' | 'quest') => void;
  gaussianCount?: GaussianCount;
}

/** Toggle switch between desktop and Quest SPZ variants */
export function DesktopQuestToggle({
  mode,
  onChange,
  gaussianCount,
}: DesktopQuestToggleProps): React.JSX.Element {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Viewer Mode
      </h3>

      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'desktop'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
          onClick={() => onChange('desktop')}
        >
          Desktop
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            mode === 'quest'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
          onClick={() => onChange('quest')}
        >
          Quest
        </button>
      </div>

      {gaussianCount && (
        <div className="text-xs text-gray-500 text-center">
          {mode === 'desktop'
            ? `${gaussianCount.desktop.toLocaleString()} gaussians`
            : `${gaussianCount.quest.toLocaleString()} gaussians`}
        </div>
      )}
    </div>
  );
}
