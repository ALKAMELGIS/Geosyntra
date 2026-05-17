import { useCallback, useEffect } from 'react';
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

/**
 * Projection switching without on-map FABs (F = 2D, G = globe).
 * Terrain toggles remain available via persisted settings / map logic.
 */
export function SiMapProjectionToggle({
  mode: _mode,
  onModeChange,
  terrainEnabled: _terrainEnabled,
  onTerrainEnabledChange: _onTerrainEnabledChange,
  terrainExaggeration: _terrainExaggeration,
  onTerrainExaggerationChange: _onTerrainExaggerationChange,
  toast,
}: SiMapProjectionToggleProps) {
  void _mode;
  void _terrainEnabled;
  void _onTerrainEnabledChange;
  void _terrainExaggeration;
  void _onTerrainExaggerationChange;

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

  return toast ? (
    <div className="gis-map-projection-toast si-map-projection-toast show" role="status" aria-live="polite">
      {toast}
    </div>
  ) : null;
}
