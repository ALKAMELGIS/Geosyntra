export type SiMapSunSkySeasonalMode = 'off' | 'summer' | 'winter' | 'compare';

export type SiMapSunSkyAnalysisTab = 'overview' | 'sky' | 'shadows' | 'analysis';

export type SiMapSunSkySettings = {
  /** Show sun azimuth line and marker on the map. */
  showSunPosition: boolean;
  /** Show approximate solar arc for the selected date. */
  showSolarPath: boolean;
  /** Hillshade + terrain shadow sync (requires DEM). */
  terrainShadows: boolean;
  /** Mapbox fill-extrusion cast-shadows on 3D buildings. */
  buildingShadows: boolean;
  /** Summer / winter solstice comparison overlay. */
  seasonalMode: SiMapSunSkySeasonalMode;
  /** Active panel section. */
  activeTab: SiMapSunSkyAnalysisTab;
  /** Line-of-sight sketch: observer point. */
  losObserver: { lng: number; lat: number } | null;
  /** Line-of-sight sketch: target point. */
  losTarget: { lng: number; lat: number } | null;
  /** Rooftop assessment area in m² (user override). */
  rooftopAreaM2: number;
  /** Panel density for rooftop PV estimate (W/m²). */
  panelDensityWm2: number;
};

export const DEFAULT_SI_MAP_SUN_SKY_SETTINGS: SiMapSunSkySettings = {
  showSunPosition: true,
  showSolarPath: true,
  terrainShadows: true,
  buildingShadows: true,
  seasonalMode: 'off',
  activeTab: 'overview',
  losObserver: null,
  losTarget: null,
  rooftopAreaM2: 120,
  panelDensityWm2: 180,
};

export const SI_MAP_SUN_SKY_SETTINGS_LS = 'si-map-sun-sky-settings-v1';

export function sanitizeSiMapSunSkySettings(raw: unknown): SiMapSunSkySettings {
  const d = DEFAULT_SI_MAP_SUN_SKY_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const seasonal = o.seasonalMode;
  const tab = o.activeTab;
  const readPt = (v: unknown): { lng: number; lat: number } | null => {
    if (!v || typeof v !== 'object') return null;
    const p = v as { lng?: unknown; lat?: unknown };
    const lng = Number(p.lng);
    const lat = Number(p.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
  };
  return {
    showSunPosition: o.showSunPosition !== false,
    showSolarPath: o.showSolarPath !== false,
    terrainShadows: o.terrainShadows !== false,
    buildingShadows: o.buildingShadows !== false,
    seasonalMode:
      seasonal === 'summer' || seasonal === 'winter' || seasonal === 'compare' ? seasonal : 'off',
    activeTab:
      tab === 'sky' || tab === 'shadows' || tab === 'analysis' ? tab : 'overview',
    losObserver: readPt(o.losObserver),
    losTarget: readPt(o.losTarget),
    rooftopAreaM2:
      typeof o.rooftopAreaM2 === 'number' && Number.isFinite(o.rooftopAreaM2)
        ? Math.max(10, Math.min(50_000, o.rooftopAreaM2))
        : d.rooftopAreaM2,
    panelDensityWm2:
      typeof o.panelDensityWm2 === 'number' && Number.isFinite(o.panelDensityWm2)
        ? Math.max(80, Math.min(350, o.panelDensityWm2))
        : d.panelDensityWm2,
  };
}

export function loadStoredSiMapSunSkySettings(): SiMapSunSkySettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SI_MAP_SUN_SKY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SI_MAP_SUN_SKY_SETTINGS_LS);
    if (!raw) return { ...DEFAULT_SI_MAP_SUN_SKY_SETTINGS };
    return sanitizeSiMapSunSkySettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SI_MAP_SUN_SKY_SETTINGS };
  }
}

export function persistSiMapSunSkySettings(settings: SiMapSunSkySettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_SUN_SKY_SETTINGS_LS, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
