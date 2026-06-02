import type { Map as MapboxMap } from 'mapbox-gl';
import {
  ensureSiMapboxStyleGlyphs,
  SI_3D_LABEL_MAX_ZOOM,
  SI_3D_LABEL_MIN_ZOOM,
  SI_TERRAIN_CONTOUR_LABEL_LAYER_ID,
  applySiMap3DSymbolLayerStyle,
  resolveSiMapboxGlyphFontStack,
  siMap3DLabelPaint,
  siMap3DLineLabelLayout,
} from './siMap3DLabels';
import {
  findFirstNonBasemapLayerId,
  findFirstSiBasemapLayerId,
  mapHasSiRasterBasemapStack,
} from './siMapBasemapRuntime';
import {
  findMapboxInsertBeforeIdAboveWmsStack,
  raiseSiMapTerrainContourLayersAboveWms,
  topmostSiMapWmsRasterLayerIndex,
} from './siMapWmsRasterLayerStack';
import { applySiGlobeFogNoHalo } from './siMapWeatherEffects';
import type { SymbologyClassMethod, SymbologyColorRamp } from '../layerTypes';
import { clampInt, coerceSymbologyColorRamp, coerceSymbologyMethod } from '../symbologyHelpers';
import {
  buildSiContourClassifiedColorExpression,
  buildSiContourClassifiedWidthExpression,
  normalizeSiContourSurfaceType,
  type SiContourSurfaceType,
} from './siContourClassification';

export type SiMapProjectionMode = '2d' | 'globe';

/** Stable references for react-map-gl `projection` (inline objects retrigger Mapbox every render). */
export const SI_MAPBOX_PROJECTION_GLOBE = { name: 'globe' as const };
export const SI_MAPBOX_PROJECTION_MERCATOR = { name: 'mercator' as const };

export function siMapboxProjectionForMode(mode: SiMapProjectionMode): typeof SI_MAPBOX_PROJECTION_GLOBE {
  return mode === 'globe' ? SI_MAPBOX_PROJECTION_GLOBE : SI_MAPBOX_PROJECTION_MERCATOR;
}

export const SI_MAP_PROJECTION_MODE_LS = 'si-map-projection-mode-v1';

/** Internal coordinate reference system for all GeoJSON, identify, and exports. */
export const SI_MAP_COORDINATE_SYSTEM_LABEL = 'WGS 84';
export const SI_MAP_COORDINATE_SYSTEM_EPSG = 'EPSG:4326';

export function formatSiMapWgs84Coordinate(lng: number, lat: number, decimals = 5): string {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '—';
  const ew = lng >= 0 ? 'E' : 'W';
  const ns = lat >= 0 ? 'N' : 'S';
  return `${Math.abs(lat).toFixed(decimals)}° ${ns}, ${Math.abs(lng).toFixed(decimals)}° ${ew}`;
}

export function siMapDisplayProjectionLabel(mode: SiMapProjectionMode): string {
  return mode === 'globe' ? '3D Globe' : 'Web Mercator 2D';
}
export const SI_MAP_TERRAIN_ENABLED_LS = 'si-map-terrain-enabled-v1';
export const SI_MAP_TERRAIN_EXAGGERATION_LS = 'si-map-terrain-exaggeration-v1';
export const SI_MAP_ELEVATION_VIEW_LS = 'si-map-elevation-view-v1';
export const SI_MAP_TERRAIN_CONTOUR_ENABLED_LS = 'si-map-terrain-contour-v1';
export const SI_MAP_TERRAIN_CONTOUR_INTERVAL_LS = 'si-map-terrain-contour-interval-v1';
export const SI_MAP_TERRAIN_CONTOUR_INTENSITY_LS = 'si-map-terrain-contour-intensity-v1';
export const SI_MAP_TERRAIN_CONTOUR_LABELS_LS = 'si-map-terrain-contour-labels-v1';
export const SI_MAP_TERRAIN_CONTOUR_LABEL_SIZE_LS = 'si-map-terrain-contour-label-size-v1';
export const SI_MAP_TERRAIN_CONTOUR_LABEL_COLOR_LS = 'si-map-terrain-contour-label-color-v1';
export const SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_LS = 'si-map-terrain-contour-classification-v1';
export const SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_MODE_LS = 'si-map-terrain-contour-classification-mode-v1';
export const SI_MAP_TERRAIN_CONTOUR_MAIN_LINES_LS = 'si-map-terrain-contour-main-lines-v1';
export const SI_MAP_TERRAIN_CONTOUR_MAIN_EVERY_LS = 'si-map-terrain-contour-main-every-v1';
export const SI_MAP_TERRAIN_CONTOUR_SURFACE_LS = 'si-map-terrain-contour-surface-v1';
export const SI_MAP_TERRAIN_CONTOUR_CLASS_COUNT_LS = 'si-map-terrain-contour-class-count-v1';
export const SI_MAP_TERRAIN_CONTOUR_CLASS_METHOD_LS = 'si-map-terrain-contour-class-method-v1';
export const SI_MAP_TERRAIN_CONTOUR_COLOR_RAMP_LS = 'si-map-terrain-contour-color-ramp-v1';
export const SI_MAP_TERRAIN_CONTOUR_CLASS_COLORS_LS = 'si-map-terrain-contour-class-colors-v1';
export const SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS = 'si-map-terrain-hillshade-intensity-v1';
export const SI_MAP_ELEVATION_PITCH_LS = 'si-map-elevation-pitch-v1';

export const SI_MAPBOX_TERRAIN_DEM_SOURCE_ID = 'si-mapbox-terrain-dem';
const DEM_SOURCE_ID = SI_MAPBOX_TERRAIN_DEM_SOURCE_ID;
const TERRAIN_VECTOR_SOURCE_ID = 'si-mapbox-terrain-v2';
/**
 * Tiny upward bias (metres above ground) for the elevated contour line. With
 * `line-elevation-reference: 'ground'` the contour hugs the rendered terrain mesh instead of the
 * old draped pass that z-fights on steep slopes (sections sink under / float above the surface).
 * A small positive offset keeps the stroke just above the surface so it never disappears under a
 * ridge; it is negligible versus typical contour intervals so labels stay aligned.
 */
export const SI_CONTOUR_TERRAIN_LIFT_M = 2;
export const BUILDINGS_LAYER_ID = 'si-3d-buildings';
const CONTOUR_LAYER_ID = 'si-terrain-contours';
const CONTOUR_LABEL_LAYER_ID = SI_TERRAIN_CONTOUR_LABEL_LAYER_ID;
export const HILLSHADE_LAYER_ID = 'si-terrain-hillshade';

export const SI_ELEVATION_VIEW_PITCH = 58;
/** Camera ease duration for 2D ↔ 3D elevation view (continuous crossfade + pitch ramp). */
export const SI_ELEVATION_VIEW_TRANSITION_MS = 720;
/** Lock window while projection/elevation camera is animating (prevents viewState feedback loops). */
export const SI_ELEVATION_VIEW_TRANSITION_LOCK_MS = SI_ELEVATION_VIEW_TRANSITION_MS + 96;
/** Wheel zoom rate in 3D elevation mode (higher = faster scroll zoom). */
export const SI_ELEVATION_WHEEL_ZOOM_RATE = 1 / 220;
export const SI_ELEVATION_ZOOM_RATE = 1 / 65;
export const SI_DEFAULT_WHEEL_ZOOM_RATE = 1 / 450;
export const SI_DEFAULT_ZOOM_RATE = 1 / 100;
export const SI_TERRAIN_EXAGGERATION_MIN = 0.5;
export const SI_TERRAIN_EXAGGERATION_MAX = 3;
/** Smallest spacing applied on the map (0 on the slider snaps here). */
export const SI_CONTOUR_INTERVAL_MIN = 0.1;
export const SI_CONTOUR_INTERVAL_MAX = 250;
/** Slider / keyboard step (m) — supports 0.1, 0.25, 0.5, 0.75, 1, … */
export const SI_CONTOUR_INTERVAL_STEP = 0.05;
export const SI_CONTOUR_INTERVAL_SLIDER_MIN = 0;
export const SI_CONTOUR_INTERVAL_DECIMALS = 4;
export const SI_CONTOUR_LABEL_SIZE_MIN = 8;
export const SI_CONTOUR_LABEL_SIZE_MAX = 20;
export const SI_DEFAULT_CONTOUR_LABEL_COLOR = '#bae6fd';
export const SI_ELEVATION_PITCH_MIN = 25;
export const SI_ELEVATION_PITCH_MAX = 85;
export const SI_CONTOUR_MAIN_LINE_EVERY_MIN = 2;
export const SI_CONTOUR_MAIN_LINE_EVERY_MAX = 10;
export const SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT = 5;
export const SI_CONTOUR_LINE_WIDTH_MIN = 0.35;
export const SI_CONTOUR_LINE_WIDTH_MAX = 4;
export const SI_MAP_TERRAIN_CONTOUR_THEME_LS = 'si-map-terrain-contour-theme-v1';
export const SI_MAP_TERRAIN_CONTOUR_INTERVAL_COLOR_LS = 'si-map-terrain-contour-interval-color-v1';
export const SI_MAP_TERRAIN_CONTOUR_MAIN_COLOR_LS = 'si-map-terrain-contour-main-color-v1';
export const SI_MAP_TERRAIN_CONTOUR_INTERVAL_WIDTH_LS = 'si-map-terrain-contour-interval-width-v1';
export const SI_MAP_TERRAIN_CONTOUR_MAIN_WIDTH_LS = 'si-map-terrain-contour-main-width-v1';
export const SI_MAP_TERRAIN_CONTOUR_MAIN_OPACITY_LS = 'si-map-terrain-contour-main-opacity-v1';
export const SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_LS = 'si-map-terrain-contour-line-smooth-v1';
export const SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_AMOUNT_LS = 'si-map-terrain-contour-line-smooth-amount-v1';
export const SI_CONTOUR_LINE_SMOOTH_AMOUNT_MIN = 0;
export const SI_CONTOUR_LINE_SMOOTH_AMOUNT_MAX = 8;

export type SiContourClassificationMode = 'elevation' | 'density' | 'gradient';
export type SiContourColorTheme = 'dark' | 'light';

export const SI_CONTOUR_THEME_PRESETS: Record<
  SiContourColorTheme,
  {
    intervalColor: string;
    mainColor: string;
    labelColor: string;
    intervalOpacity: number;
    mainOpacity: number;
    intervalWidth: number;
    mainWidth: number;
  }
> = {
  dark: {
    intervalColor: '#38bdf8',
    mainColor: '#f8fafc',
    labelColor: '#e0f2fe',
    intervalOpacity: 0.46,
    mainOpacity: 0.96,
    intervalWidth: 0.75,
    mainWidth: 1.85,
  },
  light: {
    intervalColor: '#0369a1',
    mainColor: '#0f172a',
    labelColor: '#0c4a6e',
    intervalOpacity: 0.55,
    mainOpacity: 0.92,
    intervalWidth: 0.8,
    mainWidth: 2,
  },
};

export type SiMapTerrainSettings = {
  /** Vertical scaling (Mapbox terrain exaggeration). */
  exaggeration: number;
  /** Hillshade relief strength (elevation intensity). */
  hillshadeIntensity: number;
  contourEnabled: boolean;
  /** Contour spacing in meters. */
  contourIntervalM: number;
  /** Interval contour line opacity (0–1). */
  contourIntensity: number;
  /** Index (main) contour opacity when main lines are enabled. */
  contourMainLineOpacity: number;
  contourColorTheme: SiContourColorTheme;
  contourIntervalLineColor: string;
  contourMainLineColor: string;
  contourIntervalLineWidth: number;
  contourMainLineWidth: number;
  /** Elevation labels along contour lines. */
  contourLabelsEnabled: boolean;
  /** Contour label text size (px). */
  contourLabelSize: number;
  /** Contour label fill color. */
  contourLabelColor: string;
  /** Color-classify contour lines by class breaks and color ramp. */
  contourClassificationEnabled: boolean;
  /** Legacy visual modes when classification is off (optional fallback palette). */
  contourClassificationMode: SiContourClassificationMode;
  /** Contour variable preset (elevation, slope, temperature, rainfall). */
  contourSurfaceType: SiContourSurfaceType;
  contourClassCount: number;
  contourClassMethod: SymbologyClassMethod;
  contourColorRamp: SymbologyColorRamp;
  contourClassColors: Record<string, string>;
  /** Emphasize index (main) contour lines with thicker stroke. */
  contourMainLinesEnabled: boolean;
  /** Main contour every N × interval (e.g. 5 → 50 m when interval is 10 m). */
  contourMainLineEvery: number;
  /** Camera pitch when 3D elevation view is on. */
  elevationPitch: number;
  /** Soften contour strokes with Mapbox `line-blur`. */
  contourLineSmooth: boolean;
  /** `line-blur` radius in px when smooth is on. */
  contourLineSmoothAmount: number;
};

export const SI_DEFAULT_TERRAIN_SETTINGS: SiMapTerrainSettings = {
  exaggeration: 1.2,
  hillshadeIntensity: 0.28,
  contourEnabled: false,
  contourIntervalM: 50,
  contourIntensity: SI_CONTOUR_THEME_PRESETS.dark.intervalOpacity,
  contourMainLineOpacity: SI_CONTOUR_THEME_PRESETS.dark.mainOpacity,
  contourColorTheme: 'dark',
  contourIntervalLineColor: SI_CONTOUR_THEME_PRESETS.dark.intervalColor,
  contourMainLineColor: SI_CONTOUR_THEME_PRESETS.dark.mainColor,
  contourIntervalLineWidth: SI_CONTOUR_THEME_PRESETS.dark.intervalWidth,
  contourMainLineWidth: SI_CONTOUR_THEME_PRESETS.dark.mainWidth,
  contourLabelsEnabled: false,
  contourLabelSize: 11,
  contourLabelColor: SI_CONTOUR_THEME_PRESETS.dark.labelColor,
  contourClassificationEnabled: false,
  contourClassificationMode: 'elevation',
  contourSurfaceType: 'elevation',
  contourClassCount: 5,
  contourClassMethod: 'jenks',
  contourColorRamp: 'viridis',
  contourClassColors: {},
  contourMainLinesEnabled: true,
  contourMainLineEvery: SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT,
  elevationPitch: SI_ELEVATION_VIEW_PITCH,
  contourLineSmooth: false,
  contourLineSmoothAmount: 1.5,
};

export type SiMapTerrainOptions = SiMapTerrainSettings & {
  enabled: boolean;
  buildings?: boolean;
};

function clampTerrainExaggeration(n: number): number {
  return Math.min(SI_TERRAIN_EXAGGERATION_MAX, Math.max(SI_TERRAIN_EXAGGERATION_MIN, n));
}

export function clampContourIntervalM(n: number): number {
  if (!Number.isFinite(n)) return SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalM;
  const capped = Math.min(SI_CONTOUR_INTERVAL_MAX, Math.max(0, n));
  const snapped =
    Math.round(capped / SI_CONTOUR_INTERVAL_STEP) * SI_CONTOUR_INTERVAL_STEP;
  const clamped = Math.max(SI_CONTOUR_INTERVAL_MIN, Math.min(SI_CONTOUR_INTERVAL_MAX, snapped));
  return Number(clamped.toFixed(SI_CONTOUR_INTERVAL_DECIMALS));
}

/** Display in the Interval field (trim trailing zeros). */
export function formatContourIntervalDisplay(m: number): string {
  return String(parseFloat(clampContourIntervalM(m).toFixed(SI_CONTOUR_INTERVAL_DECIMALS)));
}

export function parseContourIntervalDraft(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '.');
  if (!t || !/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Mapbox filter: elevation is a multiple of `intervalM` (decimal-safe). */
export function buildSiContourIntervalMatchExpression(intervalM: number): unknown[] {
  const interval = clampContourIntervalM(intervalM);
  const ele = ['to-number', ['get', 'ele']];
  return ['==', ['%', ['round', ['/', ele, interval]], 1], 0];
}

export function clampContourLabelSize(n: number): number {
  return Math.min(SI_CONTOUR_LABEL_SIZE_MAX, Math.max(SI_CONTOUR_LABEL_SIZE_MIN, Math.round(n)));
}

export function normalizeContourLineColor(raw: string | undefined, fallback: string): string {
  const h = (raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function normalizeContourColorTheme(raw: string | undefined): SiContourColorTheme {
  return raw === 'light' ? 'light' : 'dark';
}

export function clampContourLineWidth(n: number): number {
  return Math.min(SI_CONTOUR_LINE_WIDTH_MAX, Math.max(SI_CONTOUR_LINE_WIDTH_MIN, n));
}

export function siContourThemePatch(theme: SiContourColorTheme): Partial<SiMapTerrainSettings> {
  const p = SI_CONTOUR_THEME_PRESETS[theme];
  return {
    contourColorTheme: theme,
    contourIntervalLineColor: p.intervalColor,
    contourMainLineColor: p.mainColor,
    contourLabelColor: p.labelColor,
    contourIntensity: p.intervalOpacity,
    contourMainLineOpacity: p.mainOpacity,
    contourIntervalLineWidth: p.intervalWidth,
    contourMainLineWidth: p.mainWidth,
  };
}

export function normalizeContourLabelColor(raw: string | undefined): string {
  const h = (raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return SI_DEFAULT_CONTOUR_LABEL_COLOR;
}

export function clampElevationPitch(n: number): number {
  return Math.min(SI_ELEVATION_PITCH_MAX, Math.max(SI_ELEVATION_PITCH_MIN, n));
}

export function clampContourLineSmoothAmount(n: number): number {
  return Math.min(
    SI_CONTOUR_LINE_SMOOTH_AMOUNT_MAX,
    Math.max(SI_CONTOUR_LINE_SMOOTH_AMOUNT_MIN, Math.round(n * 10) / 10),
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampContourMainLineEvery(n: number): number {
  return Math.min(SI_CONTOUR_MAIN_LINE_EVERY_MAX, Math.max(SI_CONTOUR_MAIN_LINE_EVERY_MIN, Math.round(n)));
}

export function normalizeContourClassificationMode(raw: string | undefined): SiContourClassificationMode {
  if (raw === 'density' || raw === 'gradient') return raw;
  return 'elevation';
}

function terrainOptsFromPartial(opts: SiMapTerrainOptions): Required<
  Pick<
    SiMapTerrainSettings,
    | 'exaggeration'
    | 'hillshadeIntensity'
    | 'contourEnabled'
    | 'contourIntervalM'
    | 'contourIntensity'
    | 'contourMainLineOpacity'
    | 'contourColorTheme'
    | 'contourIntervalLineColor'
    | 'contourMainLineColor'
    | 'contourIntervalLineWidth'
    | 'contourMainLineWidth'
    | 'contourLabelsEnabled'
    | 'contourLabelSize'
    | 'contourLabelColor'
    | 'contourClassificationEnabled'
    | 'contourClassificationMode'
    | 'contourSurfaceType'
    | 'contourClassCount'
    | 'contourClassMethod'
    | 'contourColorRamp'
    | 'contourClassColors'
    | 'contourMainLinesEnabled'
    | 'contourMainLineEvery'
    | 'contourLineSmooth'
    | 'contourLineSmoothAmount'
  >
> {
  return {
    exaggeration: clampTerrainExaggeration(opts.exaggeration ?? SI_DEFAULT_TERRAIN_SETTINGS.exaggeration),
    hillshadeIntensity: clamp01(opts.hillshadeIntensity ?? SI_DEFAULT_TERRAIN_SETTINGS.hillshadeIntensity),
    contourEnabled: opts.contourEnabled ?? SI_DEFAULT_TERRAIN_SETTINGS.contourEnabled,
    contourIntervalM: clampContourIntervalM(
      opts.contourIntervalM ?? SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalM,
    ),
    contourIntensity: clamp01(opts.contourIntensity ?? SI_DEFAULT_TERRAIN_SETTINGS.contourIntensity),
    contourMainLineOpacity: clamp01(
      opts.contourMainLineOpacity ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineOpacity,
    ),
    contourColorTheme: normalizeContourColorTheme(
      opts.contourColorTheme ?? SI_DEFAULT_TERRAIN_SETTINGS.contourColorTheme,
    ),
    contourIntervalLineColor: normalizeContourLineColor(
      opts.contourIntervalLineColor ?? SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalLineColor,
      SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalLineColor,
    ),
    contourMainLineColor: normalizeContourLineColor(
      opts.contourMainLineColor ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineColor,
      SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineColor,
    ),
    contourIntervalLineWidth: clampContourLineWidth(
      opts.contourIntervalLineWidth ?? SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalLineWidth,
    ),
    contourMainLineWidth: clampContourLineWidth(
      opts.contourMainLineWidth ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineWidth,
    ),
    contourLabelsEnabled:
      opts.contourLabelsEnabled ?? SI_DEFAULT_TERRAIN_SETTINGS.contourLabelsEnabled,
    contourLabelSize: clampContourLabelSize(
      opts.contourLabelSize ?? SI_DEFAULT_TERRAIN_SETTINGS.contourLabelSize,
    ),
    contourLabelColor: normalizeContourLabelColor(
      opts.contourLabelColor ?? SI_DEFAULT_TERRAIN_SETTINGS.contourLabelColor,
    ),
    contourClassificationEnabled:
      opts.contourClassificationEnabled ?? SI_DEFAULT_TERRAIN_SETTINGS.contourClassificationEnabled,
    contourClassificationMode: normalizeContourClassificationMode(
      opts.contourClassificationMode ?? SI_DEFAULT_TERRAIN_SETTINGS.contourClassificationMode,
    ),
    contourSurfaceType: normalizeSiContourSurfaceType(
      opts.contourSurfaceType ?? SI_DEFAULT_TERRAIN_SETTINGS.contourSurfaceType,
    ),
    contourClassCount: clampInt(
      opts.contourClassCount ?? SI_DEFAULT_TERRAIN_SETTINGS.contourClassCount,
      2,
      12,
    ),
    contourClassMethod: coerceSymbologyMethod(
      opts.contourClassMethod ?? SI_DEFAULT_TERRAIN_SETTINGS.contourClassMethod,
    ),
    contourColorRamp: coerceSymbologyColorRamp(
      opts.contourColorRamp ?? SI_DEFAULT_TERRAIN_SETTINGS.contourColorRamp,
    ),
    contourClassColors:
      opts.contourClassColors && typeof opts.contourClassColors === 'object'
        ? { ...opts.contourClassColors }
        : { ...SI_DEFAULT_TERRAIN_SETTINGS.contourClassColors },
    contourMainLinesEnabled:
      opts.contourMainLinesEnabled ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLinesEnabled,
    contourMainLineEvery: clampContourMainLineEvery(
      opts.contourMainLineEvery ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineEvery,
    ),
    contourLineSmooth: opts.contourLineSmooth ?? SI_DEFAULT_TERRAIN_SETTINGS.contourLineSmooth,
    contourLineSmoothAmount: clampContourLineSmoothAmount(
      opts.contourLineSmoothAmount ?? SI_DEFAULT_TERRAIN_SETTINGS.contourLineSmoothAmount,
    ),
  };
}

/** Label every contour at the user Interval (matches line filter). */
export function buildSiContourLabelFilter(settings: SiMapTerrainSettings): unknown[] {
  return buildSiContourIntervalMatchExpression(settings.contourIntervalM);
}

function contourLineBlurPaint(settings: SiMapTerrainSettings): number {
  return settings.contourLineSmooth ? clampContourLineSmoothAmount(settings.contourLineSmoothAmount) : 0;
}

function removeSiContourOverlays(map: MapboxMap): void {
  try {
    if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) map.removeLayer(CONTOUR_LABEL_LAYER_ID);
    if (map.getLayer(CONTOUR_LAYER_ID)) map.removeLayer(CONTOUR_LAYER_ID);
  } catch {
    /* ignore */
  }
  try {
    if (map.getSource(TERRAIN_VECTOR_SOURCE_ID)) map.removeSource(TERRAIN_VECTOR_SOURCE_ID);
  } catch {
    /* style reload — source cache may be undefined */
  }
}

/** Remove 3D mesh overlays only — contour lines/labels can stay on the 2D map canvas. */
export function removeSiMapboxCompositeBuildingsLayer(map: MapboxMap): void {
  try {
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID);
  } catch {
    /* style reloading */
  }
}

function removeSiTerrainMeshOverlays(map: MapboxMap): void {
  try {
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID);
  } catch {
    /* ignore */
  }
  try {
    map.setTerrain(null);
  } catch {
    /* ignore */
  }
}

function removeSiTerrainOverlays(map: MapboxMap): void {
  removeSiContourOverlays(map);
  removeSiTerrainMeshOverlays(map);
}

/** Index contour lines + elevation labels on the Mapbox canvas (above WMS / basemap). */
export function syncSiMapContourOverlaysOnCanvas(map: MapboxMap, settings: SiMapTerrainSettings): void {
  const t = terrainOptsFromPartial(settings);
  if (!t.contourEnabled) {
    removeSiContourOverlays(map);
    return;
  }
  try {
    syncSiContourLayer(map, t, true);
    syncSiContourLabelLayer(map, t);
    raiseSiMapTerrainContourLayersAboveWms(map);
    map.triggerRepaint?.();
  } catch (e) {
    console.warn('[siMapProjectionTerrain] contour overlay sync failed', e);
  }
}

function findLabelLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]!;
    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) return layer.id;
  }
  return undefined;
}

/** Insert contours above live WMS when present; otherwise below first operational layer. */
function findSiContourLayerInsertBeforeId(map: MapboxMap): string | undefined {
  if (topmostSiMapWmsRasterLayerIndex(map) >= 0) {
    return findMapboxInsertBeforeIdAboveWmsStack(map);
  }
  return findFirstNonBasemapLayerId(map) ?? findLabelLayerId(map);
}

function buildContourLineColor(
  mode: SiContourClassificationMode,
  classificationEnabled: boolean,
  mainLinesEnabled: boolean,
  isMajorExpr: unknown[],
): unknown {
  const ele = ['round', ['get', 'ele']];
  let classified: unknown = '#7dd3fc';
  if (classificationEnabled) {
    switch (mode) {
      case 'elevation':
        classified = [
          'step',
          ele,
          '#1e40af',
          100,
          '#0284c7',
          350,
          '#16a34a',
          700,
          '#ca8a04',
          1200,
          '#dc2626',
          2200,
          '#9333ea',
        ];
        break;
      case 'density':
        classified = [
          'interpolate',
          ['linear'],
          ele,
          0,
          '#0369a1',
          400,
          '#0ea5e9',
          900,
          '#67e8f9',
          1800,
          '#e0f2fe',
        ];
        break;
      case 'gradient':
        classified = [
          'interpolate',
          ['linear'],
          ele,
          0,
          '#172554',
          300,
          '#1d4ed8',
          800,
          '#10b981',
          1400,
          '#f59e0b',
          2400,
          '#b91c1c',
        ];
        break;
    }
  }
  if (mainLinesEnabled) {
    return ['case', isMajorExpr, '#f8fafc', classified];
  }
  return classified;
}

function buildSiContourLinePaint(settings: SiMapTerrainSettings): {
  lineColor: unknown;
  lineWidth: unknown;
  lineOpacity: unknown;
  isMajor: unknown[];
} {
  const intervalM = clampContourIntervalM(settings.contourIntervalM);
  const majorEvery = intervalM * settings.contourMainLineEvery;
  const isMajor: unknown[] = buildSiContourIntervalMatchExpression(majorEvery);

  const intervalColor = settings.contourIntervalLineColor;
  const mainColor = settings.contourMainLineColor;
  const classified = settings.contourClassificationEnabled
    ? buildSiContourClassifiedColorExpression(settings)
    : buildContourLineColor(
        settings.contourClassificationMode,
        false,
        false,
        isMajor,
      );

  const lineColor = settings.contourClassificationEnabled
    ? settings.contourMainLinesEnabled
      ? (['case', isMajor, mainColor, classified] as unknown)
      : classified
    : settings.contourMainLinesEnabled
      ? (['case', isMajor, mainColor, intervalColor] as unknown)
      : intervalColor;

  const intervalW = settings.contourClassificationEnabled
    ? buildSiContourClassifiedWidthExpression(settings, settings.contourIntervalLineWidth)
    : settings.contourIntervalLineWidth;
  const mainW = settings.contourMainLineWidth;
  const lineWidth = settings.contourMainLinesEnabled
    ? (['case', isMajor, mainW, intervalW] as unknown)
    : intervalW;

  const intervalOp = settings.contourIntensity;
  const mainOp = settings.contourMainLineOpacity;
  const lineOpacity = settings.contourMainLinesEnabled
    ? (['case', isMajor, mainOp, intervalOp] as unknown)
    : intervalOp;

  return { lineColor, lineWidth, lineOpacity, isMajor };
}

/**
 * Force a (possibly pre-existing) contour line layer to render elevated/ground-referenced so it
 * conforms to the 3D terrain surface. Wrapped in try/catch because `line-z-offset` is unsupported
 * under the globe projection and on older Mapbox GL builds — failing safe leaves the draped default.
 */
function applySiContourTerrainConform(map: MapboxMap, layerId: string): void {
  try {
    map.setLayoutProperty(layerId, 'line-elevation-reference', 'ground');
    map.setLayoutProperty(layerId, 'line-z-offset', SI_CONTOUR_TERRAIN_LIFT_M);
  } catch {
    /* ignore: keep default draped rendering */
  }
}

function syncSiContourLayer(map: MapboxMap, settings: SiMapTerrainSettings, enabled: boolean): void {
  if (!enabled) {
    if (map.getLayer(CONTOUR_LAYER_ID)) map.removeLayer(CONTOUR_LAYER_ID);
    return;
  }

  if (!map.getSource(TERRAIN_VECTOR_SOURCE_ID)) {
    map.addSource(TERRAIN_VECTOR_SOURCE_ID, {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-terrain-v2',
    });
  }

  const intervalM = clampContourIntervalM(settings.contourIntervalM);
  const { lineColor, lineWidth, lineOpacity } = buildSiContourLinePaint(settings);

  const contourPaint = {
    'line-color': lineColor,
    'line-opacity': lineOpacity,
    'line-width': lineWidth,
    'line-blur': contourLineBlurPaint(settings),
    'line-emissive-strength': 0.35,
  };

  const contourLayout = {
    'line-join': 'round' as const,
    'line-cap': 'round' as const,
    'line-miter-limit': 2,
    // Elevated, ground-referenced rendering makes the contour follow the 3D terrain mesh (and its
    // exaggeration) instead of the default draped pass, which z-fights / pokes through on steep slopes.
    'line-elevation-reference': 'ground' as const,
    'line-z-offset': SI_CONTOUR_TERRAIN_LIFT_M,
  };
  const contourFilter: unknown[] = buildSiContourIntervalMatchExpression(intervalM);

  if (map.getLayer(CONTOUR_LAYER_ID)) {
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-opacity', lineOpacity);
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-color', lineColor);
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-width', lineWidth);
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-blur', contourLineBlurPaint(settings));
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-emissive-strength', 0.35);
    applySiContourTerrainConform(map, CONTOUR_LAYER_ID);
    map.setFilter(CONTOUR_LAYER_ID, contourFilter);
    raiseSiMapTerrainContourLayersAboveWms(map);
    return;
  }

  const beforeId = findSiContourLayerInsertBeforeId(map);
  map.addLayer(
    {
      id: CONTOUR_LAYER_ID,
      type: 'line',
      source: TERRAIN_VECTOR_SOURCE_ID,
      'source-layer': 'contour',
      filter: contourFilter,
      layout: contourLayout,
      paint: contourPaint,
      minzoom: 9,
    },
    beforeId,
  );
  applySiContourTerrainConform(map, CONTOUR_LAYER_ID);
  raiseSiMapTerrainContourLayersAboveWms(map);
}

/** ArcGIS Scene Viewer–style elevation text along index contours. */
export function siMapContourElevationLabelField(): unknown {
  return ['concat', ['to-string', ['round', ['get', 'ele']]], ' m'];
}

function siMapContourLineLabelLayout(baseSizePx: number, textFont: string[]) {
  return {
    ...siMap3DLineLabelLayout({
      textField: siMapContourElevationLabelField(),
      baseSizePx,
      spacing: 240,
      textFont,
    }),
    'symbol-z-elevate': true,
    'text-max-angle': 38,
    'text-padding': 4,
  };
}

function syncSiContourLabelLayer(map: MapboxMap, settings: SiMapTerrainSettings): void {
  if (!settings.contourEnabled || !settings.contourLabelsEnabled) {
    if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) map.removeLayer(CONTOUR_LABEL_LAYER_ID);
    return;
  }

  ensureSiMapboxStyleGlyphs(map);
  if (!map.getSource(TERRAIN_VECTOR_SOURCE_ID)) {
    map.addSource(TERRAIN_VECTOR_SOURCE_ID, {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-terrain-v2',
    });
  }

  const labelFilter = buildSiContourLabelFilter(settings);

  const size = clampContourLabelSize(settings.contourLabelSize);
  const color = normalizeContourLabelColor(settings.contourLabelColor);
  const textFont = resolveSiMapboxGlyphFontStack(map);
  const labelLayout = siMapContourLineLabelLayout(size, textFont);
  const labelPaint = siMap3DLabelPaint(color, {
    haloColor: settings.contourColorTheme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(2, 6, 23, 0.9)',
    opacity: 0.98,
  });

  if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) {
    map.setFilter(CONTOUR_LABEL_LAYER_ID, labelFilter);
    applySiMap3DSymbolLayerStyle(map, CONTOUR_LABEL_LAYER_ID, labelLayout, labelPaint);
    raiseSiMapTerrainContourLayersAboveWms(map);
    map.triggerRepaint?.();
    return;
  }

  const beforeId = findSiContourLayerInsertBeforeId(map);
  map.addLayer(
    {
      id: CONTOUR_LABEL_LAYER_ID,
      type: 'symbol',
      source: TERRAIN_VECTOR_SOURCE_ID,
      'source-layer': 'contour',
      filter: labelFilter,
      layout: labelLayout,
      paint: labelPaint,
      minzoom: SI_3D_LABEL_MIN_ZOOM,
      maxzoom: SI_3D_LABEL_MAX_ZOOM,
    },
    beforeId,
  );
  try {
    if (map.getLayer(CONTOUR_LAYER_ID)) map.moveLayer(CONTOUR_LABEL_LAYER_ID);
  } catch {
    /* ignore */
  }
  raiseSiMapTerrainContourLayersAboveWms(map);
  map.triggerRepaint?.();
}

/** Re-apply contour labels after WMS/basemap stack changes (lines may exist while labels were dropped). */
export function ensureSiTerrainContourLabels(map: MapboxMap, settings: SiMapTerrainSettings): void {
  if (!settings.contourEnabled || !settings.contourLabelsEnabled) return;
  syncSiContourLabelLayer(map, settings);
}

/**
 * 2D hillshade washes out in-place satellite basemaps when stacked above raster tiles.
 * 3D terrain mesh + directional lights still provide relief in elevation view.
 */
function syncSiHillshadeLayer(
  map: MapboxMap,
  hillshadeIntensity: number,
  enabled: boolean,
  opts?: { allowOverRasterBasemap?: boolean },
): void {
  if (!enabled) {
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    return;
  }

  const rasterBasemap = mapHasSiRasterBasemapStack(map);
  if (rasterBasemap && opts?.allowOverRasterBasemap !== true) {
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    return;
  }

  if (!map.getSource(DEM_SOURCE_ID)) {
    map.addSource(DEM_SOURCE_ID, {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  const exaggeration = hillshadeIntensity * (rasterBasemap ? 0.45 : 0.65);
  const shadowColor = rasterBasemap ? '#0f172a' : '#020617';
  const highlightColor = rasterBasemap ? '#f8fafc' : '#e2e8f0';

  if (map.getLayer(HILLSHADE_LAYER_ID)) {
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-exaggeration', exaggeration);
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-shadow-color', shadowColor);
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-highlight-color', highlightColor);
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-accent-color', '#64748b');
    return;
  }

  const beforeId =
    findFirstSiBasemapLayerId(map) ?? findLabelLayerId(map) ?? CONTOUR_LAYER_ID;
  map.addLayer(
    {
      id: HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: DEM_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': exaggeration,
        'hillshade-shadow-color': shadowColor,
        'hillshade-highlight-color': highlightColor,
        'hillshade-accent-color': '#64748b',
      },
    },
    beforeId,
  );
}

/**
 * Minimal terrain stack for ArcGIS Daylight (hillshade + DEM mesh for directional lights).
 * Runs once per map instance — lighting updates must not re-bootstrap terrain or basemap layers.
 */
const siMapDaylightTerrainReady = new WeakMap<MapboxMap, boolean>();

export function resetSiMapDaylightTerrainSupport(map: MapboxMap): void {
  siMapDaylightTerrainReady.delete(map);
}

export function ensureSiMapDaylightTerrainSupport(
  map: MapboxMap,
  opts?: { buildings?: boolean },
): void {
  if (siMapDaylightTerrainReady.get(map)) {
    if (opts?.buildings === false || !map.getLayer(BUILDINGS_LAYER_ID)) return;
    try {
      if (map.getLayer(BUILDINGS_LAYER_ID)) {
        map.setPaintProperty(
          BUILDINGS_LAYER_ID,
          'fill-extrusion-cast-shadows',
          opts?.buildings !== false,
        );
      }
    } catch {
      /* optional */
    }
    return;
  }

  try {
    if (!map.getSource(DEM_SOURCE_ID)) {
      map.addSource(DEM_SOURCE_ID, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    syncSiHillshadeLayer(map, 0.42, true, { allowOverRasterBasemap: true });
    if (!map.getTerrain()) {
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1.15 });
    }

    siMapDaylightTerrainReady.set(map, true);

    if (opts?.buildings === false) return;
    const style = map.getStyle();
    const hasComposite = Boolean(style?.sources?.composite);
    if (!hasComposite || map.getLayer(BUILDINGS_LAYER_ID)) return;

    const beforeId = findLabelLayerId(map);
    map.addLayer(
      {
        id: BUILDINGS_LAYER_ID,
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', ['get', 'extrude'], 'true'],
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': '#94a3b8',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.72,
          'fill-extrusion-cast-shadows': true,
        },
      },
      beforeId,
    );
  } catch (e) {
    console.warn('[siMapProjectionTerrain] daylight terrain setup failed', e);
  }
}

/** Enable Mapbox terrain DEM, hillshade, contours, buildings, and globe fog for 3D mode. */
export function applySiMapTerrain(map: MapboxMap, opts: SiMapTerrainOptions): void {
  const t = terrainOptsFromPartial(opts);

  try {
    if (!opts.enabled) {
      removeSiTerrainMeshOverlays(map);
      if (t.contourEnabled) {
        syncSiMapContourOverlaysOnCanvas(map, t);
      } else {
        removeSiContourOverlays(map);
      }
      return;
    }

    if (!map.getSource(DEM_SOURCE_ID)) {
      map.addSource(DEM_SOURCE_ID, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }

    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: t.exaggeration });

    syncSiHillshadeLayer(map, t.hillshadeIntensity, true);
    syncSiContourLayer(map, t, t.contourEnabled);
    syncSiContourLabelLayer(map, t);

    if (opts.buildings !== false && !map.getLayer(BUILDINGS_LAYER_ID)) {
      const style = map.getStyle();
      const hasComposite = Boolean(style?.sources?.composite);
      if (hasComposite) {
        const beforeId = findLabelLayerId(map);
        map.addLayer(
          {
            id: BUILDINGS_LAYER_ID,
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', ['get', 'extrude'], 'true'],
            type: 'fill-extrusion',
            minzoom: 13,
            paint: {
              'fill-extrusion-color': '#94a3b8',
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.72,
              'fill-extrusion-cast-shadows': true,
            },
          },
          beforeId,
        );
      }
    }
  } catch (e) {
    console.warn('[siMapProjectionTerrain] apply failed', e);
  }
}

/** Signature for skipping redundant terrain sync passes. */
export function siMapTerrainSettingsSignature(opts: SiMapTerrainOptions): string {
  const t = terrainOptsFromPartial(opts);
  return [
    opts.enabled ? '1' : '0',
    t.exaggeration.toFixed(2),
    t.hillshadeIntensity.toFixed(2),
    t.contourEnabled ? '1' : '0',
    String(t.contourIntervalM),
    t.contourIntensity.toFixed(2),
    t.contourMainLineOpacity.toFixed(2),
    t.contourColorTheme,
    t.contourIntervalLineColor,
    t.contourMainLineColor,
    t.contourIntervalLineWidth.toFixed(2),
    t.contourMainLineWidth.toFixed(2),
    t.contourLabelsEnabled ? '1' : '0',
    String(t.contourLabelSize),
    t.contourLabelColor,
    t.contourClassificationEnabled ? '1' : '0',
    t.contourClassificationMode,
    t.contourSurfaceType,
    String(t.contourClassCount),
    t.contourClassMethod,
    t.contourColorRamp,
    JSON.stringify(t.contourClassColors),
    t.contourMainLinesEnabled ? '1' : '0',
    String(t.contourMainLineEvery),
    String(clampElevationPitch(opts.elevationPitch ?? SI_DEFAULT_TERRAIN_SETTINGS.elevationPitch)),
    t.contourLineSmooth ? '1' : '0',
    t.contourLineSmoothAmount.toFixed(1),
    opts.buildings === false ? '0' : '1',
  ].join(':');
}

export type SiMapCameraSnapshot = {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
};

/** Centered 3D globe overview for Satellite Intelligence (pitch 0 keeps the sphere in the map canvas center). */
export const SI_GLOBE_HOME_VIEW: SiMapCameraSnapshot = {
  longitude: 20,
  latitude: 0,
  zoom: 1.52,
  pitch: 0,
  bearing: 0,
};

export function readSiMapboxProjectionName(map: MapboxMap): string | null {
  try {
    const p = map.getProjection?.()
    if (p && typeof p === 'object' && 'name' in p) {
      return String((p as { name: string }).name)
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Google Earth–style orbit: Ctrl (or ⌘ on macOS) + left-drag tilts and rotates the camera. */
export function siMapCameraOrbitModifierPressed(ev: {
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean {
  return !!(ev.ctrlKey || ev.metaKey);
}

export const SI_MAP_CAMERA_ORBIT_PITCH_MAX = SI_ELEVATION_PITCH_MAX;

const SI_MAP_CAMERA_ORBIT_PITCH_SENS = 0.62;
const SI_MAP_CAMERA_ORBIT_BEARING_SENS = 0.48;

const siMap3dPanOnlyGuardByMap = new WeakMap<MapboxMap, (e: MouseEvent) => void>();
const siMap3dContextMenuBlockByMap = new WeakMap<MapboxMap, (e: Event) => void>();

/** Block browser context menu in 3D so right-drag orbits instead of opening the menu. */
function attachSiMap3dContextMenuBlock(map: MapboxMap): void {
  if (siMap3dContextMenuBlockByMap.has(map)) return;
  const canvas = map.getCanvas?.();
  if (!canvas) return;
  const block = (e: Event) => {
    e.preventDefault();
  };
  canvas.addEventListener('contextmenu', block);
  siMap3dContextMenuBlockByMap.set(map, block);
}

function detachSiMap3dContextMenuBlock(map: MapboxMap): void {
  const block = siMap3dContextMenuBlockByMap.get(map);
  if (!block) return;
  try {
    map.getCanvas?.()?.removeEventListener('contextmenu', block);
  } catch {
    /* ignore */
  }
  siMap3dContextMenuBlockByMap.delete(map);
}

/** Block Mapbox ctrl+left native rotate in 3D — left button is pan-only (right-drag orbits). */
function attachSiMap3dPanOnlyGuard(map: MapboxMap): void {
  if (siMap3dPanOnlyGuardByMap.has(map)) return;
  const canvas = map.getCanvas?.();
  if (!canvas) return;
  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('mousedown', onDown, true);
  siMap3dPanOnlyGuardByMap.set(map, onDown);
}

function detachSiMap3dPanOnlyGuard(map: MapboxMap): void {
  const onDown = siMap3dPanOnlyGuardByMap.get(map);
  if (!onDown) return;
  try {
    map.getCanvas?.()?.removeEventListener('mousedown', onDown, true);
  } catch {
    /* ignore */
  }
  siMap3dPanOnlyGuardByMap.delete(map);
}

/**
 * 3D elevation / Scene View: left-drag pan, right-drag rotate + pitch (custom handler).
 * 2D: pan only; right-drag tilts into 3D (see siMapRightDragElevation); Ctrl+left uses the same tilt ramp.
 */
export function configureSiMapCameraControlsForView(
  map: MapboxMap,
  elevation3d: boolean,
): void {
  try {
    map.dragPan?.enable?.();
    map.scrollZoom?.enable?.();
    map.dragRotate?.disable?.();
    if (elevation3d) {
      attachSiMap3dPanOnlyGuard(map);
      attachSiMap3dContextMenuBlock(map);
    } else {
      detachSiMap3dPanOnlyGuard(map);
      detachSiMap3dContextMenuBlock(map);
    }
  } catch {
    /* ignore */
  }
}

/** Disable Mapbox right-drag rotate so Ctrl+left-drag is Google Earth–style orbit in 2D. */
export function configureSiMapGoogleEarthCameraControls(map: MapboxMap): void {
  configureSiMapCameraControlsForView(map, false);
}

export function siMapCameraOrbitFromDrag(
  pitch0: number,
  bearing0: number,
  dx: number,
  dy: number,
): { pitch: number; bearing: number } {
  return {
    bearing: bearing0 + dx * SI_MAP_CAMERA_ORBIT_BEARING_SENS,
    pitch: Math.max(
      0,
      Math.min(SI_MAP_CAMERA_ORBIT_PITCH_MAX, pitch0 - dy * SI_MAP_CAMERA_ORBIT_PITCH_SENS),
    ),
  };
}

export type SiMapCameraOrbitDragSession = {
  startX: number;
  startY: number;
  bearing0: number;
  pitch0: number;
  moved: boolean;
};

/** True when Ctrl+ LMB orbit tilt should take over (before draw/AOI handlers). */
export function siMapShouldStartCameraOrbitDrag(opts: {
  button: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** 3D Scene View uses right-drag rotate; do not hijack left-drag with Ctrl. */
  elevation3d?: boolean;
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
}): boolean {
  if (opts.elevation3d) return false;
  if (opts.button !== 0) return false;
  if (!siMapCameraOrbitModifierPressed(opts)) return false;
  if (opts.mapDrawTool === 'polygon' && opts.polygonRingLength > 0) return false;
  if (opts.mapDrawTool === 'rectangle' && opts.hasRectCirclePreview) return false;
  if (
    opts.mapDrawTool === 'circle' &&
    (opts.hasCircleRefineDraft || opts.hasRectCirclePreview)
  ) {
    return false;
  }
  if (opts.mapDrawTool === 'polyline' && opts.hasPolylineStart) return false;
  if (opts.mapDrawTool === 'lasso' || opts.mapDrawTool === 'freehand' || opts.mapDrawTool === 'text') {
    return false;
  }
  return true;
}

/** True when right-drag should orbit bearing/pitch in 3D elevation view. */
export function siMapShouldStartCameraOrbitDragRight3d(opts: {
  button: number;
  shiftKey?: boolean;
  elevation3d?: boolean;
  mapDrawTool: string;
  polygonRingLength: number;
  hasPolylineStart: boolean;
  hasCircleRefineDraft: boolean;
  hasRectCirclePreview: boolean;
}): boolean {
  if (!opts.elevation3d) return false;
  if (opts.button !== 2) return false;
  if (opts.shiftKey) return false;
  if (opts.mapDrawTool === 'polygon' && opts.polygonRingLength > 0) return false;
  if (opts.mapDrawTool === 'rectangle' && opts.hasRectCirclePreview) return false;
  if (
    opts.mapDrawTool === 'circle' &&
    (opts.hasCircleRefineDraft || opts.hasRectCirclePreview)
  ) {
    return false;
  }
  if (opts.mapDrawTool === 'polyline' && opts.hasPolylineStart) return false;
  if (opts.mapDrawTool === 'lasso' || opts.mapDrawTool === 'freehand' || opts.mapDrawTool === 'text') {
    return false;
  }
  return true;
}

/** Begin right-drag camera orbit in 3D elevation (left-drag stays pan-only). */
export function siMapBeginCameraOrbitDragRight3d(
  map: MapboxMap,
  clientX: number,
  clientY: number,
): SiMapCameraOrbitDragSession {
  let bearing0 = 0;
  let pitch0 = 0;
  try {
    bearing0 = map.getBearing();
    pitch0 = map.getPitch();
  } catch {
    /* ignore */
  }
  try {
    map.dragPan?.disable?.();
  } catch {
    /* ignore */
  }
  return {
    startX: clientX,
    startY: clientY,
    bearing0,
    pitch0,
    moved: false,
  };
}

export function siMapBeginCameraOrbitDrag(
  map: MapboxMap,
  clientX: number,
  clientY: number,
): SiMapCameraOrbitDragSession {
  let bearing0 = 0;
  let pitch0 = 0;
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }
  try {
    bearing0 = map.getBearing();
    pitch0 = map.getPitch();
  } catch {
    /* ignore */
  }
  configureSiMapGoogleEarthCameraControls(map);
  try {
    map.dragPan?.disable?.();
  } catch {
    /* ignore */
  }
  return {
    startX: clientX,
    startY: clientY,
    bearing0,
    pitch0,
    moved: false,
  };
}

export function siMapApplyCameraOrbitDrag(
  map: MapboxMap,
  session: SiMapCameraOrbitDragSession,
  clientX: number,
  clientY: number,
): { pitch: number; bearing: number } {
  const dx = clientX - session.startX;
  const dy = clientY - session.startY;
  if (Math.abs(dx) + Math.abs(dy) > 2) session.moved = true;
  const { pitch, bearing } = siMapCameraOrbitFromDrag(
    session.pitch0,
    session.bearing0,
    dx,
    dy,
  );
  try {
    map.jumpTo({
      pitch,
      bearing,
      offset: siElevationPitchScreenOffset(map, pitch),
      duration: 0,
    });
  } catch {
    /* ignore */
  }
  return { pitch, bearing };
}

export function siMapEndCameraOrbitDrag(
  map: MapboxMap | null | undefined,
  opts?: { elevation3d?: boolean },
): void {
  if (!map) return;
  configureSiMapCameraControlsForView(map, opts?.elevation3d ?? false);
}

/** Clamp react-map-gl view state so 2D mode never feeds pitch/bearing into a maxPitch=0 map. */
export function clampSiViewStateForProjection<T extends { pitch?: number; bearing?: number }>(
  viewState: T,
  mode: SiMapProjectionMode,
  opts?: { allowPitch?: boolean },
): T {
  if (mode === 'globe' || opts?.allowPitch) return viewState
  return {
    ...viewState,
    pitch: 0,
    bearing: 0,
  }
}

/** Avoid controlled MapGL `onMove` → setState loops when floats differ only at epsilon. */
export function siViewStatesNear(
  a: { longitude: number; latitude: number; zoom?: number; pitch?: number; bearing?: number },
  b: { longitude: number; latitude: number; zoom?: number; pitch?: number; bearing?: number },
): boolean {
  const eps = 1e-5
  return (
    Math.abs(a.longitude - b.longitude) < eps &&
    Math.abs(a.latitude - b.latitude) < eps &&
    Math.abs((a.zoom ?? 0) - (b.zoom ?? 0)) < eps &&
    Math.abs((a.pitch ?? 0) - (b.pitch ?? 0)) < eps &&
    Math.abs((a.bearing ?? 0) - (b.bearing ?? 0)) < eps
  )
}

export function readSiMapCamera(map: MapboxMap): SiMapCameraSnapshot {
  const c = map.getCenter();
  return {
    longitude: c.lng,
    latitude: c.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

/** Apply globe projection + centered home camera (used on SI map load). */
export function applySiGlobeHomeView(
  map: MapboxMap,
  terrain: SiMapTerrainOptions,
  opts?: { durationMs?: number },
): void {
  try {
    if (readSiMapboxProjectionName(map) !== 'globe') {
      map.setProjection({ name: 'globe' });
    }
  } catch {
    /* ignore */
  }

  applySiMapTerrain(map, { ...terrain, enabled: terrain.enabled });
  applySiGlobeFogNoHalo(map);

  try {
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  } catch {
    /* ignore */
  }

  const duration = opts?.durationMs ?? 0;
  try {
    map.resize();
    map.jumpTo({
      center: [SI_GLOBE_HOME_VIEW.longitude, SI_GLOBE_HOME_VIEW.latitude],
      zoom: SI_GLOBE_HOME_VIEW.zoom,
      bearing: SI_GLOBE_HOME_VIEW.bearing,
      pitch: SI_GLOBE_HOME_VIEW.pitch,
    });
    if (duration > 0) {
      map.easeTo({
        center: [SI_GLOBE_HOME_VIEW.longitude, SI_GLOBE_HOME_VIEW.latitude],
        zoom: SI_GLOBE_HOME_VIEW.zoom,
        bearing: SI_GLOBE_HOME_VIEW.bearing,
        pitch: SI_GLOBE_HOME_VIEW.pitch,
        duration,
        essential: true,
      });
    }
  } catch {
    /* ignore */
  }
}

/** Switch 2D/3D projection while preserving center + zoom (smooth camera). */
export function applySiMapProjectionMode(
  map: MapboxMap,
  mode: SiMapProjectionMode,
  camera: SiMapCameraSnapshot,
  terrain: SiMapTerrainOptions,
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  const duration = opts?.durationMs ?? 620;
  const isGlobe = mode === 'globe';
  const targetPitch = isGlobe ? camera.pitch : 0;
  const targetBearing = isGlobe ? camera.bearing : 0;
  const wantProjection = isGlobe ? 'globe' : 'mercator';

  try {
    if (readSiMapboxProjectionName(map) !== wantProjection) {
      map.setProjection({ name: wantProjection });
    }
  } catch {
    /* ignore */
  }

  applySiMapTerrain(map, { ...terrain, enabled: isGlobe && terrain.enabled });
  if (isGlobe) applySiGlobeFogNoHalo(map);

  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: targetBearing,
      pitch: targetPitch,
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }

  return {
    longitude: camera.longitude,
    latitude: camera.latitude,
    zoom: camera.zoom,
    bearing: targetBearing,
    pitch: targetPitch,
  };
}

/** Map canvas is 3D globe only — migrate any legacy 2D preference. */
export function migrateSiMapProjectionToGlobeOnly(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_PROJECTION_MODE_LS, 'globe');
  } catch {
    /* ignore */
  }
}

export function loadStoredSiMapProjectionMode(): SiMapProjectionMode {
  migrateSiMapProjectionToGlobeOnly();
  return 'globe';
}

export function loadStoredSiTerrainEnabled(): boolean {
  return loadStoredSiElevationViewActive();
}

/**
 * 3D Elevation View is opt-in only — never auto-enable from localStorage on load.
 * User toggles via the elevation dock; `persistSiElevationViewActive` stores preference for sliders only.
 */
export function loadStoredSiElevationViewActive(): boolean {
  migrateSiElevationViewDefaultOff();
  return false;
}

/** Clear legacy persisted “always on” flags (one-time per browser profile). */
export function migrateSiElevationViewDefaultOff(): void {
  if (typeof window === 'undefined') return;
  const MIGRATION_LS = 'si-map-elevation-opt-in-migration-v1';
  try {
    if (window.localStorage.getItem(MIGRATION_LS) === '1') return;
    window.localStorage.setItem(SI_MAP_ELEVATION_VIEW_LS, '0');
    window.localStorage.setItem(SI_MAP_TERRAIN_ENABLED_LS, '0');
    window.localStorage.setItem(MIGRATION_LS, '1');
  } catch {
    /* ignore */
  }
}

export function persistSiElevationViewActive(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_ELEVATION_VIEW_LS, active ? '1' : '0');
    persistSiTerrainEnabled(active);
  } catch {
    /* ignore */
  }
}

/**
 * Screen offset so the globe/terrain focal point stays visually centered when pitch increases
 * (without this, enabling 3D makes the map appear to slide downward).
 */
export function siElevationPitchScreenOffset(map: MapboxMap, pitch: number): [number, number] {
  if (pitch <= 4) return [0, 0];
  const h = map.getCanvas()?.clientHeight ?? map.getContainer()?.clientHeight ?? 640;
  const t = Math.min(1, pitch / SI_ELEVATION_PITCH_MAX);
  return [0, -Math.round(h * 0.2 * t)];
}

/** Smooth, responsive scroll-wheel zoom — especially important in pitched 3D mode. */
export function configureSiMapScrollZoomForElevation(map: MapboxMap, elevationActive: boolean): void {
  try {
    const sz = map.scrollZoom;
    if (!sz) return;
    sz.enable();
    const wheelRate = elevationActive ? SI_ELEVATION_WHEEL_ZOOM_RATE : SI_DEFAULT_WHEEL_ZOOM_RATE;
    const zoomRate = elevationActive ? SI_ELEVATION_ZOOM_RATE : SI_DEFAULT_ZOOM_RATE;
    if (typeof (sz as { setWheelZoomRate?: (r: number) => void }).setWheelZoomRate === 'function') {
      (sz as { setWheelZoomRate: (r: number) => void }).setWheelZoomRate(wheelRate);
    }
    if (typeof (sz as { setZoomRate?: (r: number) => void }).setZoomRate === 'function') {
      (sz as { setZoomRate: (r: number) => void }).setZoomRate(zoomRate);
    }
  } catch {
    /* ignore */
  }
}

/** Toggle 3D terrain DEM + camera pitch on the current basemap (keeps center/zoom). */
export function applySiElevationView(
  map: MapboxMap,
  enable: boolean,
  camera: SiMapCameraSnapshot,
  terrain: SiMapTerrainSettings & { buildings?: boolean },
  opts?: { durationMs?: number },
): SiMapCameraSnapshot {
  const duration = opts?.durationMs ?? SI_ELEVATION_VIEW_TRANSITION_MS;
  const targetPitch = clampElevationPitch(terrain.elevationPitch ?? SI_ELEVATION_VIEW_PITCH);

  if (enable) {
    try {
      if (readSiMapboxProjectionName(map) !== 'globe') {
        map.setProjection({ name: 'globe' });
      }
    } catch {
      /* ignore */
    }

    applySiMapTerrain(map, {
      enabled: true,
      buildings: terrain.buildings !== false,
      ...terrain,
    });

    const pitch = Math.max(camera.pitch, targetPitch);
    const offset = siElevationPitchScreenOffset(map, pitch);
    configureSiMapScrollZoomForElevation(map, true);
    try {
      map.easeTo({
        center: [camera.longitude, camera.latitude],
        zoom: camera.zoom,
        bearing: camera.bearing,
        pitch,
        offset,
        duration,
        essential: true,
      });
    } catch {
      /* ignore */
    }

    return { ...camera, pitch };
  }

  applySiMapTerrain(map, { enabled: false, buildings: false });
  configureSiMapScrollZoomForElevation(map, false);

  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: 0,
      offset: [0, 0],
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }

  return { ...camera, pitch: 0 };
}

/** Wait for a Mapbox camera ease to finish (moveend or timeout fallback). Returns cleanup. */
export function awaitSiMapCameraTransition(
  map: MapboxMap,
  durationMs: number,
  onComplete: () => void,
): () => void {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      map.off('moveend', onMoveEnd);
    } catch {
      /* ignore */
    }
    onComplete();
  };
  const onMoveEnd = () => finish();
  try {
    map.once('moveend', onMoveEnd);
  } catch {
    /* ignore */
  }
  const timer = window.setTimeout(finish, durationMs + 64);
  return () => {
    finished = true;
    window.clearTimeout(timer);
    try {
      map.off('moveend', onMoveEnd);
    } catch {
      /* ignore */
    }
  };
}

export function persistSiTerrainEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_TERRAIN_ENABLED_LS, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadStoredSiTerrainExaggeration(): number {
  return loadStoredSiTerrainSettings().exaggeration;
}

/** Contour lines/labels are opt-in only — clear legacy auto-on flags once per browser profile. */
export function migrateSiTerrainContourDefaultOff(): void {
  if (typeof window === 'undefined') return;
  const MIGRATION_LS = 'si-map-contour-opt-in-migration-v1';
  try {
    if (window.localStorage.getItem(MIGRATION_LS) === '1') return;
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS, '0');
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_LABELS_LS, '0');
    window.localStorage.setItem(MIGRATION_LS, '1');
  } catch {
    /* ignore */
  }
}

export const SI_TERRAIN_CONTOUR_SETTING_KEYS = [
  'contourEnabled',
  'contourIntervalM',
  'contourIntensity',
  'contourMainLineOpacity',
  'contourColorTheme',
  'contourIntervalLineColor',
  'contourMainLineColor',
  'contourIntervalLineWidth',
  'contourMainLineWidth',
  'contourLabelsEnabled',
  'contourLabelSize',
  'contourLabelColor',
  'contourClassificationEnabled',
  'contourClassificationMode',
  'contourSurfaceType',
  'contourClassCount',
  'contourClassMethod',
  'contourColorRamp',
  'contourClassColors',
  'contourMainLinesEnabled',
  'contourMainLineEvery',
  'contourLineSmooth',
  'contourLineSmoothAmount',
] as const satisfies readonly (keyof SiMapTerrainSettings)[];

export function siTerrainSettingsPatchAffectsContours(patch: Partial<SiMapTerrainSettings>): boolean {
  return SI_TERRAIN_CONTOUR_SETTING_KEYS.some(k => k in patch);
}

export function loadStoredSiTerrainSettings(): SiMapTerrainSettings {
  migrateSiTerrainContourDefaultOff();
  if (typeof window === 'undefined') return { ...SI_DEFAULT_TERRAIN_SETTINGS };
  try {
    const exaggeration = Number(window.localStorage.getItem(SI_MAP_TERRAIN_EXAGGERATION_LS));
    const hillshadeIntensity = Number(window.localStorage.getItem(SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS));
    const contourIntervalM = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTERVAL_LS));
    const contourIntensity = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTENSITY_LS));
    const contourMainOpacity = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_OPACITY_LS));
    const contourIntervalWidth = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTERVAL_WIDTH_LS));
    const contourMainWidth = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_WIDTH_LS));
    const contourTheme = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_THEME_LS);
    const contourIntervalColor = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTERVAL_COLOR_LS);
    const contourMainColor = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_COLOR_LS);
    const elevationPitch = Number(window.localStorage.getItem(SI_MAP_ELEVATION_PITCH_LS));
    const contourRaw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS);
    const contourLabelsRaw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABELS_LS);
    const contourLabelSize = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABEL_SIZE_LS));
    const contourLabelColor = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABEL_COLOR_LS);
    const settings: SiMapTerrainSettings = {
      exaggeration: Number.isFinite(exaggeration)
        ? clampTerrainExaggeration(exaggeration)
        : SI_DEFAULT_TERRAIN_SETTINGS.exaggeration,
      hillshadeIntensity: Number.isFinite(hillshadeIntensity)
        ? clamp01(hillshadeIntensity)
        : SI_DEFAULT_TERRAIN_SETTINGS.hillshadeIntensity,
      contourEnabled:
        contourRaw === '0' || contourRaw === 'false'
          ? false
          : contourRaw === '1' || contourRaw === 'true'
            ? true
            : SI_DEFAULT_TERRAIN_SETTINGS.contourEnabled,
      contourIntervalM: Number.isFinite(contourIntervalM)
        ? clampContourIntervalM(contourIntervalM)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalM,
      contourIntensity: Number.isFinite(contourIntensity)
        ? clamp01(contourIntensity)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourIntensity,
      contourMainLineOpacity: Number.isFinite(contourMainOpacity)
        ? clamp01(contourMainOpacity)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineOpacity,
      contourColorTheme: normalizeContourColorTheme(contourTheme ?? undefined),
      contourIntervalLineColor: normalizeContourLineColor(
        contourIntervalColor ?? undefined,
        SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalLineColor,
      ),
      contourMainLineColor: normalizeContourLineColor(
        contourMainColor ?? undefined,
        SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineColor,
      ),
      contourIntervalLineWidth: Number.isFinite(contourIntervalWidth)
        ? clampContourLineWidth(contourIntervalWidth)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourIntervalLineWidth,
      contourMainLineWidth: Number.isFinite(contourMainWidth)
        ? clampContourLineWidth(contourMainWidth)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineWidth,
      contourLabelsEnabled:
        contourLabelsRaw === '1' || contourLabelsRaw === 'true'
          ? true
          : contourLabelsRaw === '0' || contourLabelsRaw === 'false'
            ? false
            : SI_DEFAULT_TERRAIN_SETTINGS.contourLabelsEnabled,
      contourLabelSize: Number.isFinite(contourLabelSize)
        ? clampContourLabelSize(contourLabelSize)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourLabelSize,
      contourLabelColor: contourLabelColor
        ? normalizeContourLabelColor(contourLabelColor)
        : SI_DEFAULT_TERRAIN_SETTINGS.contourLabelColor,
      contourClassificationEnabled:
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_LS) === '0'
          ? false
          : window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_LS) === '1'
            ? true
            : SI_DEFAULT_TERRAIN_SETTINGS.contourClassificationEnabled,
      contourClassificationMode: normalizeContourClassificationMode(
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_MODE_LS) ?? undefined,
      ),
      contourSurfaceType: normalizeSiContourSurfaceType(
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_SURFACE_LS) ?? undefined,
      ),
      contourClassCount: (() => {
        const n = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASS_COUNT_LS));
        return Number.isFinite(n)
          ? clampInt(n, 2, 12)
          : SI_DEFAULT_TERRAIN_SETTINGS.contourClassCount;
      })(),
      contourClassMethod: coerceSymbologyMethod(
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASS_METHOD_LS) ??
          SI_DEFAULT_TERRAIN_SETTINGS.contourClassMethod,
      ),
      contourColorRamp: coerceSymbologyColorRamp(
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_COLOR_RAMP_LS) ??
          SI_DEFAULT_TERRAIN_SETTINGS.contourColorRamp,
      ),
      contourClassColors: (() => {
        try {
          const raw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_CLASS_COLORS_LS);
          if (!raw) return { ...SI_DEFAULT_TERRAIN_SETTINGS.contourClassColors };
          const parsed = JSON.parse(raw) as Record<string, string>;
          return parsed && typeof parsed === 'object' ? { ...parsed } : {};
        } catch {
          return { ...SI_DEFAULT_TERRAIN_SETTINGS.contourClassColors };
        }
      })(),
      contourMainLinesEnabled:
        window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_LINES_LS) === '0'
          ? false
          : window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_LINES_LS) === '1'
            ? true
            : SI_DEFAULT_TERRAIN_SETTINGS.contourMainLinesEnabled,
      contourMainLineEvery: (() => {
        const n = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_MAIN_EVERY_LS));
        return Number.isFinite(n)
          ? clampContourMainLineEvery(n)
          : SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineEvery;
      })(),
      elevationPitch: Number.isFinite(elevationPitch)
        ? clampElevationPitch(elevationPitch)
        : SI_DEFAULT_TERRAIN_SETTINGS.elevationPitch,
      contourLineSmooth: (() => {
        const raw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_LS);
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
        return SI_DEFAULT_TERRAIN_SETTINGS.contourLineSmooth;
      })(),
      contourLineSmoothAmount: (() => {
        const n = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_AMOUNT_LS));
        return Number.isFinite(n)
          ? clampContourLineSmoothAmount(n)
          : SI_DEFAULT_TERRAIN_SETTINGS.contourLineSmoothAmount;
      })(),
    };
    if (!settings.contourEnabled) {
      settings.contourLabelsEnabled = false;
    }
    return settings;
  } catch {
    return { ...SI_DEFAULT_TERRAIN_SETTINGS };
  }
}

export function persistSiTerrainSettings(settings: SiMapTerrainSettings): void {
  if (typeof window === 'undefined') return;
  const toStore: SiMapTerrainSettings = settings.contourEnabled
    ? settings
    : { ...settings, contourLabelsEnabled: false };
  try {
    window.localStorage.setItem(SI_MAP_TERRAIN_EXAGGERATION_LS, String(clampTerrainExaggeration(toStore.exaggeration)));
    window.localStorage.setItem(
      SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS,
      String(clamp01(toStore.hillshadeIntensity)),
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS, toStore.contourEnabled ? '1' : '0');
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTERVAL_LS,
      String(clampContourIntervalM(toStore.contourIntervalM)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTENSITY_LS,
      String(clamp01(toStore.contourIntensity)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_OPACITY_LS,
      String(clamp01(toStore.contourMainLineOpacity)),
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_THEME_LS, toStore.contourColorTheme);
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTERVAL_COLOR_LS,
      toStore.contourIntervalLineColor,
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_MAIN_COLOR_LS, toStore.contourMainLineColor);
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTERVAL_WIDTH_LS,
      String(clampContourLineWidth(toStore.contourIntervalLineWidth)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_WIDTH_LS,
      String(clampContourLineWidth(toStore.contourMainLineWidth)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABELS_LS,
      toStore.contourLabelsEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABEL_SIZE_LS,
      String(clampContourLabelSize(toStore.contourLabelSize)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABEL_COLOR_LS,
      normalizeContourLabelColor(toStore.contourLabelColor),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_LS,
      toStore.contourClassificationEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_MODE_LS,
      toStore.contourClassificationMode,
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_SURFACE_LS, toStore.contourSurfaceType);
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASS_COUNT_LS,
      String(clampInt(toStore.contourClassCount, 2, 12)),
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_CLASS_METHOD_LS, toStore.contourClassMethod);
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_COLOR_RAMP_LS, toStore.contourColorRamp);
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASS_COLORS_LS,
      JSON.stringify(toStore.contourClassColors ?? {}),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_LINES_LS,
      toStore.contourMainLinesEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_EVERY_LS,
      String(clampContourMainLineEvery(toStore.contourMainLineEvery)),
    );
    window.localStorage.setItem(
      SI_MAP_ELEVATION_PITCH_LS,
      String(clampElevationPitch(toStore.elevationPitch)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_LS,
      toStore.contourLineSmooth ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LINE_SMOOTH_AMOUNT_LS,
      String(clampContourLineSmoothAmount(toStore.contourLineSmoothAmount)),
    );
  } catch {
    /* ignore */
  }
}

/** Ease camera pitch when the user adjusts terrain view angle. */
export function applySiElevationPitch(
  map: MapboxMap,
  camera: SiMapCameraSnapshot,
  pitch: number,
  opts?: { durationMs?: number },
): void {
  const p = clampElevationPitch(pitch);
  const targetPitch = Math.max(camera.pitch, p);
  const offset = siElevationPitchScreenOffset(map, targetPitch);
  try {
    map.easeTo({
      center: [camera.longitude, camera.latitude],
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: targetPitch,
      offset,
      duration: opts?.durationMs ?? 420,
      essential: true,
    });
  } catch {
    /* ignore */
  }
}
