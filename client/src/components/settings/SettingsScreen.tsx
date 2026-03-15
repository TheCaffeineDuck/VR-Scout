import { useState, useEffect, useCallback } from 'react';
import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../../utils/constants.ts';
import './SettingsScreen.css';

type Theme = 'light' | 'dark' | 'system';

interface Settings {
  sparkVersion: string;
  defaultTrainingIterations: number;
  defaultShDegree: number;
  defaultCameraModel: string;
  defaultMatcher: string;
  maxSpzSizeMB: number;
  maxGaussianCount: number;
  wsReconnectInterval: number;
  theme: Theme;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  }
}

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <div className="settings-screen">
      <h2>Settings</h2>

      <div className="settings-screen__section">
        <h3>Appearance</h3>
        <div className="settings-screen__field">
          <label>Theme</label>
          <div className="settings-screen__theme-toggle">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                className={`settings-screen__theme-btn ${settings.theme === t ? 'settings-screen__theme-btn--active' : ''}`}
                onClick={() => update('theme', t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-screen__section">
        <h3>Renderer</h3>
        <div className="settings-screen__field">
          <label>Spark Version</label>
          <select
            className="input"
            value={settings.sparkVersion}
            onChange={(e) => update('sparkVersion', e.target.value)}
          >
            <option value="0.1.10">0.1.10 (stable)</option>
            <option value="2.0-preview">2.0-preview (experimental)</option>
          </select>
        </div>
      </div>

      <div className="settings-screen__section">
        <h3>Pipeline Defaults</h3>

        <div className="settings-screen__field">
          <label>Default Training Iterations</label>
          <input
            type="number"
            className="input"
            min={7000}
            step={1000}
            value={settings.defaultTrainingIterations}
            onChange={(e) =>
              update('defaultTrainingIterations', Math.max(7000, Number(e.target.value)))
            }
          />
        </div>

        <div className="settings-screen__field">
          <label>Default SH Degree</label>
          <select
            className="input"
            value={settings.defaultShDegree}
            onChange={(e) => update('defaultShDegree', Number(e.target.value))}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>

        <div className="settings-screen__field">
          <label>Default Camera Model</label>
          <select
            className="input"
            value={settings.defaultCameraModel}
            onChange={(e) => update('defaultCameraModel', e.target.value)}
          >
            <option value="SIMPLE_RADIAL">SIMPLE_RADIAL</option>
            <option value="OPENCV">OPENCV</option>
          </select>
        </div>

        <div className="settings-screen__field">
          <label>Default Matcher</label>
          <select
            className="input"
            value={settings.defaultMatcher}
            onChange={(e) => update('defaultMatcher', e.target.value)}
          >
            <option value="exhaustive">Exhaustive</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>
      </div>

      <div className="settings-screen__section">
        <h3>Quest 3 Budgets</h3>

        <div className="settings-screen__field">
          <label>Max SPZ Size Warning (MB)</label>
          <input
            type="number"
            className="input"
            min={1}
            value={settings.maxSpzSizeMB}
            onChange={(e) => update('maxSpzSizeMB', Number(e.target.value))}
          />
        </div>

        <div className="settings-screen__field">
          <label>Max Gaussian Count Warning</label>
          <input
            type="number"
            className="input"
            min={100000}
            step={100000}
            value={settings.maxGaussianCount}
            onChange={(e) => update('maxGaussianCount', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="settings-screen__section">
        <h3>Connection</h3>

        <div className="settings-screen__field">
          <label>WebSocket Reconnect Interval (ms)</label>
          <input
            type="number"
            className="input"
            min={1000}
            step={1000}
            value={settings.wsReconnectInterval}
            onChange={(e) => update('wsReconnectInterval', Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
