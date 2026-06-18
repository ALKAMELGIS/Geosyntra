/** Zoom ≤ enter → switch to 3D globe + terrain (Google Earth–style orbit). */
export const SI_GLOBE_AUTO_3D_ZOOM_ENTER = 5.25;
/** Zoom ≥ exit → switch to flat 2D nadir map. Hysteresis band prevents flicker. */
export const SI_GLOBE_AUTO_2D_ZOOM_EXIT = 6.75;

export const SI_MAP_GLOBE_AUTO_2D3D_LS = 'si-map-globe-auto-2d3d-v1';

/**
 * Resolve target elevation dock mode from zoom with hysteresis.
 * @param zoom Current Mapbox zoom.
 * @param currently3d Current 3D elevation dock state.
 */
export function resolveSiGlobeAutoElevation3d(zoom: number, currently3d: boolean): boolean {
  const z = Number.isFinite(zoom) ? zoom : SI_GLOBE_AUTO_3D_ZOOM_ENTER;
  if (currently3d) return z < SI_GLOBE_AUTO_2D_ZOOM_EXIT;
  return z <= SI_GLOBE_AUTO_3D_ZOOM_ENTER;
}

/** Initial elevation state when auto mode starts (midpoint of hysteresis band). */
export function siGlobeAutoElevation3dForInitialZoom(zoom: number): boolean {
  const mid = (SI_GLOBE_AUTO_3D_ZOOM_ENTER + SI_GLOBE_AUTO_2D_ZOOM_EXIT) / 2;
  const z = Number.isFinite(zoom) ? zoom : mid;
  return z <= mid;
}

export function loadStoredGlobeAuto2D3D(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(SI_MAP_GLOBE_AUTO_2D3D_LS);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
    return false;
  } catch {
    return false;
  }
}

export function persistGlobeAuto2D3D(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_GLOBE_AUTO_2D3D_LS, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
