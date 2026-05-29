import { useCallback, useEffect, useState } from 'react';
import type { SiMapProjectionMode } from '../utils/siMapProjectionTerrain';
import './SiMapProjectionToggle.css';

export type SiMapProjectionToggleProps = {
  mode: SiMapProjectionMode;
  onModeChange: (mode: SiMapProjectionMode) => void;
  terrainEnabled: boolean;
  onTerrainEnabledChange: (v: boolean) => void;
  terrainExaggeration: number;
  onTerrainExaggerationChange: (v: number) => void;
  toast?: string | null;
};

/** On-map Map projection control (same pattern as GIS Map settings). */
export function SiMapProjectionToggle({
  mode,
  onModeChange,
  terrainEnabled,
  onTerrainEnabledChange,
  terrainExaggeration,
  onTerrainExaggerationChange,
  toast,
}: SiMapProjectionToggleProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (mode !== 'globe') setSettingsOpen(false);
  }, [mode]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F') onModeChange('2d');
      if (e.key === 'g' || e.key === 'G') onModeChange('globe');
    },
    [onModeChange],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <>
      <div className="si-map-projection-float" role="group" aria-labelledby="si-map-projection-label">
        <p id="si-map-projection-label" className="gis-tool-muted si-map-projection-label">
          Map projection
        </p>
        <div className="gis-map-projection-toggle gis-map-projection-toggle--vertical gis-map-projection-toggle--float si-map-projection-toggle">
          <button
            type="button"
            className={mode === '2d' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
            onClick={() => onModeChange('2d')}
            title="2D map (F)"
            aria-label="Switch to 2D map projection. Shortcut F"
            aria-pressed={mode === '2d'}
          >
            <i className="fa-solid fa-map-location-dot" aria-hidden />
          </button>
          <button
            type="button"
            className={mode === 'globe' ? 'gis-map-tool active icon-only' : 'gis-map-tool icon-only'}
            onClick={() => onModeChange('globe')}
            title="3D Globe (G)"
            aria-label="Switch to 3D Globe projection. Shortcut G"
            aria-pressed={mode === 'globe'}
          >
            <i className="fa-solid fa-globe" aria-hidden />
          </button>
          {mode === 'globe' ? (
            <button
              type="button"
              className={`gis-map-tool icon-only si-map-projection-settings-btn${settingsOpen ? ' active' : ''}`}
              onClick={() => setSettingsOpen(o => !o)}
              title="3D terrain settings"
              aria-label="3D terrain settings"
              aria-expanded={settingsOpen}
            >
              <i className="fa-solid fa-mountain-sun" aria-hidden />
            </button>
          ) : null}
        </div>
        {settingsOpen && mode === 'globe' ? (
          <div className="si-map-projection-terrain-panel" role="region" aria-label="3D terrain settings">
            <label className="si-map-projection-terrain-row">
              <input
                type="checkbox"
                checked={terrainEnabled}
                onChange={e => onTerrainEnabledChange(e.target.checked)}
              />
              <span>Terrain elevation (DEM)</span>
            </label>
            <label className="si-map-projection-terrain-row">
              <span>Exaggeration</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={terrainExaggeration}
                disabled={!terrainEnabled}
                onChange={e => onTerrainExaggerationChange(Number(e.target.value))}
              />
              <span className="si-map-projection-terrain-val">{terrainExaggeration.toFixed(2)}×</span>
            </label>
          </div>
        ) : null}
      </div>
      {toast ? (
        <div className="gis-map-projection-toast si-map-projection-toast show" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </>
  );
}
