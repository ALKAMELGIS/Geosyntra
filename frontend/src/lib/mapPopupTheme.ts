export type MapPopupTheme = 'lux' | 'light';

export const MAP_POPUP_THEME_LS_KEY = 'si-map-popup-theme-v1';
export const MAP_POPUP_THEME_CHANGE_EVENT = 'si-map-popup-theme-change';

export function readMapPopupTheme(): MapPopupTheme {
  return 'lux';
}

export function persistMapPopupTheme(_theme: MapPopupTheme): void {
  /* unified lux black glass popup chrome */
}

export function applyMapPopupThemeToDocument(_theme?: MapPopupTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.mapPopupTheme = 'lux';
}

export function notifyMapPopupThemeChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MAP_POPUP_THEME_CHANGE_EVENT));
}

export function toggleMapPopupTheme(current: MapPopupTheme): MapPopupTheme {
  return current === 'lux' ? 'light' : 'lux';
}
