/** Session/local flag — exposes pinned 3D infrastructure rows in the layer panel. */
export const SI_MAP_DEVELOPER_MODE_LS = 'si-map-developer-mode-v1';

export function loadSiMapDeveloperMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (import.meta.env.VITE_SI_MAP_DEVELOPER_MODE === 'true') return true;
    return window.localStorage.getItem(SI_MAP_DEVELOPER_MODE_LS) === '1';
  } catch {
    return false;
  }
}

export function persistSiMapDeveloperMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_DEVELOPER_MODE_LS, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function toggleSiMapDeveloperMode(): boolean {
  const next = !loadSiMapDeveloperMode();
  persistSiMapDeveloperMode(next);
  return next;
}
