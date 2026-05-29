import type { Map as MapboxMap } from 'mapbox-gl';
import {
  SI_3D_LABEL_MAX_ZOOM,
  SI_3D_LABEL_MIN_ZOOM,
  SI_TERRAIN_CONTOUR_LABEL_LAYER_ID,
  applySiMap3DSymbolLayerStyle,
  siMap3DLabelPaint,
  siMap3DLineLabelLayout,
} from './siMap3DLabels';

export type SiMapProjectionMode = '2d' | 'globe';

/** Stable references for react-map-gl `projection` (inline objects retrigger Mapbox every render). */
export const SI_MAPBOX_PROJECTION_GLOBE = { name: 'globe' as const };
export const SI_MAPBOX_PROJECTION_MERCATOR = { name: 'mercator' as const };

export function siMapboxProjectionForMode(mode: SiMapProjectionMode): typeof SI_MAPBOX_PROJECTION_GLOBE {
  return mode === 'globe' ? SI_MAPBOX_PROJECTION_GLOBE : SI_MAPBOX_PROJECTION_MERCATOR;
}

export const SI_MAP_PROJECTION_MODE_LS = 'si-map-projection-mode-v1';
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
export const SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS = 'si-map-terrain-hillshade-intensity-v1';
export const SI_MAP_ELEVATION_PITCH_LS = 'si-map-elevation-pitch-v1';

const DEM_SOURCE_ID = 'si-mapbox-terrain-dem';
const TERRAIN_VECTOR_SOURCE_ID = 'si-mapbox-terrain-v2';
export const BUILDINGS_LAYER_ID = 'si-3d-buildings';
const CONTOUR_LAYER_ID = 'si-terrain-contours';
const CONTOUR_LABEL_LAYER_ID = SI_TERRAIN_CONTOUR_LABEL_LAYER_ID;
export const HILLSHADE_LAYER_ID = 'si-terrain-hillshade';

export const SI_ELEVATION_VIEW_PITCH = 58;
/** Wheel zoom rate in 3D elevation mode (higher = faster scroll zoom). */
export const SI_ELEVATION_WHEEL_ZOOM_RATE = 1 / 220;
export const SI_ELEVATION_ZOOM_RATE = 1 / 65;
export const SI_DEFAULT_WHEEL_ZOOM_RATE = 1 / 450;
export const SI_DEFAULT_ZOOM_RATE = 1 / 100;
export const SI_TERRAIN_EXAGGERATION_MIN = 0.5;
export const SI_TERRAIN_EXAGGERATION_MAX = 3;
export const SI_CONTOUR_INTERVAL_MIN = 1;
export const SI_CONTOUR_INTERVAL_MAX = 250;
export const SI_CONTOUR_LABEL_SIZE_MIN = 8;
export const SI_CONTOUR_LABEL_SIZE_MAX = 20;
export const SI_DEFAULT_CONTOUR_LABEL_COLOR = '#bae6fd';
export const SI_ELEVATION_PITCH_MIN = 25;
export const SI_ELEVATION_PITCH_MAX = 78;
export const SI_CONTOUR_MAIN_LINE_EVERY_MIN = 2;
export const SI_CONTOUR_MAIN_LINE_EVERY_MAX = 10;
export const SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT = 5;

export type SiContourClassificationMode = 'elevation' | 'density' | 'gradient';

export type SiMapTerrainSettings = {
  /** Vertical scaling (Mapbox terrain exaggeration). */
  exaggeration: number;
  /** Hillshade relief strength (elevation intensity). */
  hillshadeIntensity: number;
  contourEnabled: boolean;
  /** Contour spacing in meters. */
  contourIntervalM: number;
  /** Contour line opacity. */
  contourIntensity: number;
  /** Elevation labels along contour lines. */
  contourLabelsEnabled: boolean;
  /** Contour label text size (px). */
  contourLabelSize: number;
  /** Contour label fill color. */
  contourLabelColor: string;
  /** Color-classify contour lines by elevation bands / density / gradient. */
  contourClassificationEnabled: boolean;
  contourClassificationMode: SiContourClassificationMode;
  /** Emphasize index (main) contour lines with thicker stroke. */
  contourMainLinesEnabled: boolean;
  /** Main contour every N × interval (e.g. 5 → 50 m when interval is 10 m). */
  contourMainLineEvery: number;
  /** Camera pitch when 3D elevation view is on. */
  elevationPitch: number;
};

export const SI_DEFAULT_TERRAIN_SETTINGS: SiMapTerrainSettings = {
  exaggeration: 1.35,
  hillshadeIntensity: 0.48,
  contourEnabled: true,
  contourIntervalM: 50,
  contourIntensity: 0.62,
  contourLabelsEnabled: false,
  contourLabelSize: 10,
  contourLabelColor: SI_DEFAULT_CONTOUR_LABEL_COLOR,
  contourClassificationEnabled: true,
  contourClassificationMode: 'elevation',
  contourMainLinesEnabled: true,
  contourMainLineEvery: SI_CONTOUR_MAIN_LINE_EVERY_DEFAULT,
  elevationPitch: SI_ELEVATION_VIEW_PITCH,
};

export type SiMapTerrainOptions = SiMapTerrainSettings & {
  enabled: boolean;
  buildings?: boolean;
};

function clampTerrainExaggeration(n: number): number {
  return Math.min(SI_TERRAIN_EXAGGERATION_MAX, Math.max(SI_TERRAIN_EXAGGERATION_MIN, n));
}

function clampContourIntervalM(n: number): number {
  return Math.min(SI_CONTOUR_INTERVAL_MAX, Math.max(SI_CONTOUR_INTERVAL_MIN, Math.round(n)));
}

export function clampContourLabelSize(n: number): number {
  return Math.min(SI_CONTOUR_LABEL_SIZE_MAX, Math.max(SI_CONTOUR_LABEL_SIZE_MIN, Math.round(n)));
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

function clampElevationPitch(n: number): number {
  return Math.min(SI_ELEVATION_PITCH_MAX, Math.max(SI_ELEVATION_PITCH_MIN, n));
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
    | 'contourLabelsEnabled'
    | 'contourLabelSize'
    | 'contourLabelColor'
    | 'contourClassificationEnabled'
    | 'contourClassificationMode'
    | 'contourMainLinesEnabled'
    | 'contourMainLineEvery'
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
    contourMainLinesEnabled:
      opts.contourMainLinesEnabled ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLinesEnabled,
    contourMainLineEvery: clampContourMainLineEvery(
      opts.contourMainLineEvery ?? SI_DEFAULT_TERRAIN_SETTINGS.contourMainLineEvery,
    ),
  };
}

function removeSiTerrainOverlays(map: MapboxMap): void {
  try {
    if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) map.removeLayer(CONTOUR_LABEL_LAYER_ID);
    if (map.getLayer(CONTOUR_LAYER_ID)) map.removeLayer(CONTOUR_LAYER_ID);
    if (map.getLayer(HILLSHADE_LAYER_ID)) map.removeLayer(HILLSHADE_LAYER_ID);
    if (map.getLayer(BUILDINGS_LAYER_ID)) map.removeLayer(BUILDINGS_LAYER_ID);
    if (map.getSource(TERRAIN_VECTOR_SOURCE_ID)) map.removeSource(TERRAIN_VECTOR_SOURCE_ID);
    map.setTerrain(null);
  } catch {
    /* ignore */
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

function syncSiContourLayer(
  map: MapboxMap,
  intervalM: number,
  contourIntensity: number,
  enabled: boolean,
  contourOpts: Pick<
    SiMapTerrainSettings,
    | 'contourClassificationEnabled'
    | 'contourClassificationMode'
    | 'contourMainLinesEnabled'
    | 'contourMainLineEvery'
  >,
): void {
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

  const ele = ['round', ['get', 'ele']];
  const majorEvery = intervalM * contourOpts.contourMainLineEvery;
  const isMajor: unknown[] = ['==', ['%', ele, majorEvery], 0];
  const lineColor = buildContourLineColor(
    contourOpts.contourClassificationMode,
    contourOpts.contourClassificationEnabled,
    contourOpts.contourMainLinesEnabled,
    isMajor,
  );
  const lineWidth = contourOpts.contourMainLinesEnabled
    ? (['case', isMajor, 2.35, 0.85] as unknown)
    : 1;

  const contourPaint = {
    'line-color': lineColor,
    'line-opacity': contourIntensity,
    'line-width': lineWidth,
  };

  const contourLayout = { 'line-join': 'round' as const, 'line-cap': 'round' as const };
  const contourFilter: unknown[] = ['==', ['%', ele, intervalM], 0];

  if (map.getLayer(CONTOUR_LAYER_ID)) {
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-opacity', contourIntensity);
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-color', lineColor);
    map.setPaintProperty(CONTOUR_LAYER_ID, 'line-width', lineWidth);
    map.setFilter(CONTOUR_LAYER_ID, contourFilter);
    return;
  }

  const beforeId = findLabelLayerId(map);
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
}

function syncSiContourLabelLayer(
  map: MapboxMap,
  intervalM: number,
  contourEnabled: boolean,
  labelsEnabled: boolean,
  labelSize: number,
  labelColor: string,
): void {
  if (!contourEnabled || !labelsEnabled) {
    if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) map.removeLayer(CONTOUR_LABEL_LAYER_ID);
    return;
  }

  if (!map.getSource(TERRAIN_VECTOR_SOURCE_ID)) {
    map.addSource(TERRAIN_VECTOR_SOURCE_ID, {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-terrain-v2',
    });
  }

  const size = clampContourLabelSize(labelSize);
  const color = normalizeContourLabelColor(labelColor);
  const contourFilter: unknown[] = ['==', ['%', ['round', ['get', 'ele']], intervalM], 0];
  const textField = ['concat', ['to-string', ['round', ['get', 'ele']]], ' m'];
  const labelLayout = siMap3DLineLabelLayout({ textField, baseSizePx: size, spacing: 260 });
  const labelPaint = siMap3DLabelPaint(color);

  if (map.getLayer(CONTOUR_LABEL_LAYER_ID)) {
    map.setFilter(CONTOUR_LABEL_LAYER_ID, contourFilter);
    applySiMap3DSymbolLayerStyle(map, CONTOUR_LABEL_LAYER_ID, labelLayout, labelPaint);
    map.triggerRepaint?.();
    return;
  }

  const beforeId = findLabelLayerId(map);
  map.addLayer(
    {
      id: CONTOUR_LABEL_LAYER_ID,
      type: 'symbol',
      source: TERRAIN_VECTOR_SOURCE_ID,
      'source-layer': 'contour',
      filter: contourFilter,
      layout: labelLayout,
      paint: labelPaint,
      minzoom: SI_3D_LABEL_MIN_ZOOM,
      maxzoom: SI_3D_LABEL_MAX_ZOOM,
    },
    beforeId,
  );
  map.triggerRepaint?.();
}

function syncSiHillshadeLayer(map: MapboxMap, hillshadeIntensity: number, enabled: boolean): void {
  if (!enabled) {
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

  if (map.getLayer(HILLSHADE_LAYER_ID)) {
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-exaggeration', hillshadeIntensity * 0.85);
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-shadow-color', '#020617');
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-highlight-color', '#e2e8f0');
    map.setPaintProperty(HILLSHADE_LAYER_ID, 'hillshade-accent-color', '#38bdf8');
    return;
  }

  const beforeId = findLabelLayerId(map) ?? CONTOUR_LAYER_ID;
  map.addLayer(
    {
      id: HILLSHADE_LAYER_ID,
      type: 'hillshade',
      source: DEM_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': hillshadeIntensity * 0.85,
        'hillshade-shadow-color': '#020617',
        'hillshade-highlight-color': '#e2e8f0',
        'hillshade-accent-color': '#38bdf8',
      },
    },
    beforeId,
  );
}

/**
 * Minimal terrain stack for ArcGIS Daylight (hillshade + DEM mesh for directional lights).
 * Works without opening the elevation dock — safe to call on every daylight sync.
 */
export function ensureSiMapDaylightTerrainSupport(
  map: MapboxMap,
  opts?: { buildings?: boolean },
): void {
  try {
    syncSiHillshadeLayer(map, 0.42, true);
    if (!map.getTerrain()) {
      map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1.15 });
    }

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
      if (!map.getTerrain() && !map.getLayer(BUILDINGS_LAYER_ID) && !map.getLayer(CONTOUR_LAYER_ID)) {
        return;
      }
      removeSiTerrainOverlays(map);
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
    syncSiContourLayer(map, t.contourIntervalM, t.contourIntensity, t.contourEnabled, {
      contourClassificationEnabled: t.contourClassificationEnabled,
      contourClassificationMode: t.contourClassificationMode,
      contourMainLinesEnabled: t.contourMainLinesEnabled,
      contourMainLineEvery: t.contourMainLineEvery,
    });
    syncSiContourLabelLayer(
      map,
      t.contourIntervalM,
      t.contourEnabled,
      t.contourLabelsEnabled,
      t.contourLabelSize,
      t.contourLabelColor,
    );

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
    t.contourLabelsEnabled ? '1' : '0',
    String(t.contourLabelSize),
    t.contourLabelColor,
    t.contourClassificationEnabled ? '1' : '0',
    t.contourClassificationMode,
    t.contourMainLinesEnabled ? '1' : '0',
    String(t.contourMainLineEvery),
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

/** Clamp react-map-gl view state so 2D mode never feeds pitch/bearing into a maxPitch=0 map. */
export function clampSiViewStateForProjection<T extends { pitch?: number; bearing?: number }>(
  viewState: T,
  mode: SiMapProjectionMode,
): T {
  if (mode === 'globe') return viewState
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
  const duration = opts?.durationMs ?? 720;
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
      bearing: 0,
      pitch: 0,
      offset: [0, 0],
      duration,
      essential: true,
    });
  } catch {
    /* ignore */
  }

  return { ...camera, pitch: 0, bearing: 0 };
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

export function loadStoredSiTerrainSettings(): SiMapTerrainSettings {
  if (typeof window === 'undefined') return { ...SI_DEFAULT_TERRAIN_SETTINGS };
  try {
    const exaggeration = Number(window.localStorage.getItem(SI_MAP_TERRAIN_EXAGGERATION_LS));
    const hillshadeIntensity = Number(window.localStorage.getItem(SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS));
    const contourIntervalM = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTERVAL_LS));
    const contourIntensity = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_INTENSITY_LS));
    const elevationPitch = Number(window.localStorage.getItem(SI_MAP_ELEVATION_PITCH_LS));
    const contourRaw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS);
    const contourLabelsRaw = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABELS_LS);
    const contourLabelSize = Number(window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABEL_SIZE_LS));
    const contourLabelColor = window.localStorage.getItem(SI_MAP_TERRAIN_CONTOUR_LABEL_COLOR_LS);
    return {
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
    };
  } catch {
    return { ...SI_DEFAULT_TERRAIN_SETTINGS };
  }
}

export function persistSiTerrainSettings(settings: SiMapTerrainSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SI_MAP_TERRAIN_EXAGGERATION_LS, String(clampTerrainExaggeration(settings.exaggeration)));
    window.localStorage.setItem(
      SI_MAP_TERRAIN_HILLSHADE_INTENSITY_LS,
      String(clamp01(settings.hillshadeIntensity)),
    );
    window.localStorage.setItem(SI_MAP_TERRAIN_CONTOUR_ENABLED_LS, settings.contourEnabled ? '1' : '0');
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTERVAL_LS,
      String(clampContourIntervalM(settings.contourIntervalM)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_INTENSITY_LS,
      String(clamp01(settings.contourIntensity)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABELS_LS,
      settings.contourLabelsEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABEL_SIZE_LS,
      String(clampContourLabelSize(settings.contourLabelSize)),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_LABEL_COLOR_LS,
      normalizeContourLabelColor(settings.contourLabelColor),
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_LS,
      settings.contourClassificationEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_CLASSIFICATION_MODE_LS,
      settings.contourClassificationMode,
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_LINES_LS,
      settings.contourMainLinesEnabled ? '1' : '0',
    );
    window.localStorage.setItem(
      SI_MAP_TERRAIN_CONTOUR_MAIN_EVERY_LS,
      String(clampContourMainLineEvery(settings.contourMainLineEvery)),
    );
    window.localStorage.setItem(
      SI_MAP_ELEVATION_PITCH_LS,
      String(clampElevationPitch(settings.elevationPitch)),
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
