import { useCallback, useEffect, useState } from 'react';
import {
  applyMapPopupThemeToDocument,
  MAP_POPUP_THEME_CHANGE_EVENT,
  notifyMapPopupThemeChange,
  persistMapPopupTheme,
  readMapPopupTheme,
  toggleMapPopupTheme,
  type MapPopupTheme,
} from '../lib/mapPopupTheme';

export function useMapPopupTheme() {
  const [theme, setTheme] = useState<MapPopupTheme>(() => readMapPopupTheme());

  useEffect(() => {
    applyMapPopupThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => setTheme(readMapPopupTheme());
    window.addEventListener(MAP_POPUP_THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(MAP_POPUP_THEME_CHANGE_EVENT, sync);
  }, []);

  const setMapPopupTheme = useCallback((next: MapPopupTheme) => {
    persistMapPopupTheme(next);
    applyMapPopupThemeToDocument(next);
    setTheme(next);
    notifyMapPopupThemeChange();
  }, []);

  const toggle = useCallback(() => {
    setMapPopupTheme(toggleMapPopupTheme(readMapPopupTheme()));
  }, [setMapPopupTheme]);

  return { theme, isLux: theme === 'lux', setMapPopupTheme, toggle };
}
