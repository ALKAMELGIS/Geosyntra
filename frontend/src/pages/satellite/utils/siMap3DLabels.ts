import type { Map as MapboxMap } from 'mapbox-gl';

/** Mapbox layer id for terrain contour elevation labels. */
export const SI_TERRAIN_CONTOUR_LABEL_LAYER_ID = 'si-terrain-contour-labels';

export const SI_3D_LABEL_MIN_ZOOM = 9;
export const SI_3D_LABEL_MAX_ZOOM = 22;

/** Mapbox glyph PBF endpoint — required for any `symbol` layer (contour labels, vector labels). */
export const SI_MAPBOX_STYLE_GLYPHS = 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf';

/** Raster / shell styles omit glyphs by default — inject so contour labels can render. */
export function siMapboxStyleWithGlyphs<T extends Record<string, unknown>>(style: T): T & { glyphs: string } {
  if (typeof style.glyphs === 'string' && style.glyphs.trim()) {
    return style as T & { glyphs: string };
  }
  return { ...style, glyphs: SI_MAPBOX_STYLE_GLYPHS };
}

/**
 * Patch live Mapbox style when it was loaded without glyphs (symbol layers render nothing).
 * Safe no-op when glyphs already exist.
 */
export function ensureSiMapboxStyleGlyphs(map: MapboxMap | null | undefined): boolean {
  if (!map?.getStyle) return false;
  try {
    const style = map.getStyle();
    if (style?.glyphs) return true;
    const internal = map as MapboxMap & { style?: { stylesheet?: Record<string, unknown> } };
    const sheet = internal.style?.stylesheet;
    if (sheet && !sheet.glyphs) {
      sheet.glyphs = SI_MAPBOX_STYLE_GLYPHS;
      map.triggerRepaint?.();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Primary + fallbacks when the active basemap style lacks Mapbox Streets glyphs. */
export const SI_MAPBOX_GLYPH_FONT_FALLBACKS = [
  'Open Sans Semibold',
  'Open Sans Bold',
  'Arial Unicode MS Bold',
] as const;

/** Mapbox Streets glyph stack used across SI map labels (must match style fonts). */
export const SI_MAPBOX_GLYPH_FONT_STACK = [
  'DIN Offc Pro Medium',
  ...SI_MAPBOX_GLYPH_FONT_FALLBACKS,
] as const;

/**
 * Pick a `text-font` stack that exists on the current Mapbox style (reads an existing symbol layer).
 * Without a resolvable font, symbol layers render nothing.
 */
export function resolveSiMapboxGlyphFontStack(map: MapboxMap | null | undefined): string[] {
  if (!map?.getStyle) return [...SI_MAPBOX_GLYPH_FONT_STACK];
  try {
    const layers = map.getStyle()?.layers ?? [];
    const counts = new Map<string, number>();
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue;
      const fonts = layer.layout?.['text-font'];
      if (!Array.isArray(fonts)) continue;
      for (const f of fonts) {
        if (typeof f === 'string' && f.trim()) counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    }
    if (counts.size > 0) {
      const primary = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      const stack = [primary];
      for (const fb of SI_MAPBOX_GLYPH_FONT_STACK) {
        if (!stack.includes(fb)) stack.push(fb);
      }
      return stack;
    }
  } catch {
    /* ignore */
  }
  return [...SI_MAPBOX_GLYPH_FONT_STACK];
}

/** ArcGIS scale denominator → approximate Mapbox zoom (Web Mercator 512px tiles). */
export function arcgisScaleToMapboxZoom(scale: number): number | undefined {
  const s = Number(scale);
  if (!Number.isFinite(s) || s <= 0) return undefined;
  const z = Math.log2(59_165_755.0 / s);
  return Math.max(0, Math.min(22, Math.round(z * 10) / 10));
}

/** Parse ArcGIS `labelingInfo` for a feature attribute name (Scene Viewer label source). */
export function arcgisLabelFieldFromLabelingInfo(labelingInfo: unknown): string | null {
  if (labelingInfo == null) return null;
  const list = Array.isArray(labelingInfo) ? labelingInfo : [labelingInfo];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const info = raw as Record<string, unknown>;
    const field = info.field;
    if (typeof field === 'string' && field.trim()) return field.trim();

    const lei = info.labelExpressionInfo;
    if (lei && typeof lei === 'object') {
      const expr = (lei as Record<string, unknown>).expression;
      if (typeof expr === 'string') {
        const featureMatch = expr.match(/\$feature\.(\w+)/);
        if (featureMatch?.[1]) return featureMatch[1];
      }
    }

    const legacy = info.labelExpression;
    if (typeof legacy === 'string') {
      const bracket = legacy.match(/\[(\w+)\]/);
      if (bracket?.[1]) return bracket[1];
    }
  }
  return null;
}

export function fieldNamesFromGeoJson(geojson: unknown): string[] {
  if (!geojson || typeof geojson !== 'object') return [];
  const features = (geojson as { features?: unknown[] }).features;
  if (!Array.isArray(features) || !features.length) return [];
  for (const f of features) {
    const props = (f as { properties?: Record<string, unknown> })?.properties;
    if (props && typeof props === 'object') return Object.keys(props);
  }
  return [];
}

export function inferSiMapFeatureLabelField(
  fields: string[] | undefined,
  labelingInfo: unknown,
  geojson?: unknown,
): string | null {
  const fromArcgis = arcgisLabelFieldFromLabelingInfo(labelingInfo);
  if (fromArcgis) return fromArcgis;
  const list = fields?.length ? fields : fieldNamesFromGeoJson(geojson);
  const candidates = ['NAME', 'Name', 'name', 'label', 'Label', 'TITLE', 'Title', 'title'];
  for (const c of candidates) {
    if (list.includes(c)) return c;
  }
  return list[0] ?? null;
}

/** Zoom-interpolated label size (ArcGIS scale-dependent visibility). */
export function siMap3DLabelTextSize(basePx: number): unknown {
  const base = Math.max(8, Math.min(28, Math.round(basePx)));
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    8,
    base * 0.55,
    11,
    base * 0.78,
    14,
    base,
    17,
    base * 1.12,
    20,
    base * 1.28,
  ];
}

function siMapLabelPaintBase(color: string, opts?: { haloColor?: string; opacity?: number }) {
  return {
    'text-color': color,
    'text-halo-color': opts?.haloColor ?? 'rgba(2, 6, 23, 0.92)',
    'text-halo-width': 1.65,
    'text-halo-blur': 0.35,
    'text-opacity': opts?.opacity ?? 0.96,
  };
}

/** Flat-map label paint (no 3D-only symbol props). */
export function siMap2DLabelPaint(color: string, opts?: { haloColor?: string; opacity?: number }) {
  return siMapLabelPaintBase(color, opts);
}

/** ArcGIS Scene Viewer–style halo + material for 3D billboard labels. */
export function siMap3DLabelPaint(color: string, opts?: { haloColor?: string; opacity?: number }) {
  return {
    ...siMapLabelPaintBase(color, opts),
    'symbol-z-offset': 1.5,
  };
}

/** Line-following labels (contours, linework) — drape on terrain geometry, stay visible when pitched. */
export function siMap3DLineLabelLayout(opts: {
  textField: unknown;
  baseSizePx: number;
  spacing?: number;
  textFont?: string[];
}) {
  return {
    'symbol-placement': 'line' as const,
    'symbol-spacing': opts.spacing ?? 280,
    'symbol-z-order': 'viewport-y' as const,
    'text-field': opts.textField,
    'text-font': opts.textFont ?? [...SI_MAPBOX_GLYPH_FONT_STACK],
    'text-size': siMap3DLabelTextSize(opts.baseSizePx),
    'text-size-scale-range': [0.72, 1.85] as [number, number],
    'text-padding': 2,
    'text-max-angle': 28,
    'text-keep-upright': true,
    'text-pitch-alignment': 'viewport' as const,
    'text-rotation-alignment': 'map' as const,
    'text-anchor': 'center' as const,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-optional': false,
  };
}

/** Point labels anchored to ground/building geometry (Mapbox 3D symbol elevate). */
export function siMap3DPointLabelLayout(opts: {
  textField: unknown;
  baseSizePx: number;
  placement?: 'point' | 'line-center';
  textFont?: string[];
}) {
  const placement = opts.placement ?? 'point';
  return {
    'symbol-placement': placement,
    'symbol-z-elevate': placement === 'point',
    'symbol-z-order': 'viewport-y' as const,
    'text-field': opts.textField,
    'text-font': opts.textFont ?? [...SI_MAPBOX_GLYPH_FONT_STACK],
    'text-size': siMap3DLabelTextSize(opts.baseSizePx),
    'text-size-scale-range': [0.72, 1.85] as [number, number],
    'text-padding': 2,
    'text-pitch-alignment': 'viewport' as const,
    'text-rotation-alignment': 'viewport' as const,
    'text-anchor': 'bottom' as const,
    'text-offset': [0, -0.35] as [number, number],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-optional': false,
  };
}

export function siMap3DLabelZoomRangeFromArcgis(labelingInfo: unknown): {
  minzoom?: number;
  maxzoom?: number;
} {
  const list = Array.isArray(labelingInfo) ? labelingInfo : labelingInfo ? [labelingInfo] : [];
  let minzoom: number | undefined;
  let maxzoom: number | undefined;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const info = raw as Record<string, unknown>;
    const maxScale = Number(info.maxScale);
    const minScale = Number(info.minScale);
    if (Number.isFinite(maxScale) && maxScale > 0) {
      const z = arcgisScaleToMapboxZoom(maxScale);
      if (z != null) minzoom = minzoom == null ? z : Math.max(minzoom, z);
    }
    if (Number.isFinite(minScale) && minScale > 0) {
      const z = arcgisScaleToMapboxZoom(minScale);
      if (z != null) maxzoom = maxzoom == null ? z : Math.min(maxzoom, z);
    }
  }
  return { minzoom, maxzoom };
}

type MapboxRepaintMap = MapboxMap & { triggerRepaint?: () => void };

let boundMap: MapboxRepaintMap | null = null;
let boundHandler: (() => void) | null = null;
let boundRaf = 0;

/** ArcGIS `view.requestRender()` equivalent — repaint labels while the camera moves. */
export function bindSiMap3DLabelRenderSync(map: MapboxMap, active: boolean): void {
  const mapAny = map as MapboxRepaintMap;
  if (boundMap && boundHandler) {
    boundMap.off('move', boundHandler);
    boundMap.off('rotate', boundHandler);
    boundMap.off('pitch', boundHandler);
    boundMap.off('zoom', boundHandler);
    boundMap = null;
    boundHandler = null;
  }
  if (boundRaf) {
    cancelAnimationFrame(boundRaf);
    boundRaf = 0;
  }
  if (!active) return;
  ensureSiMapboxStyleGlyphs(map);

  const onCamera = () => {
    if (boundRaf) return;
    boundRaf = requestAnimationFrame(() => {
      boundRaf = 0;
      mapAny.triggerRepaint?.();
    });
  };

  mapAny.on('move', onCamera);
  mapAny.on('rotate', onCamera);
  mapAny.on('pitch', onCamera);
  mapAny.on('zoom', onCamera);
  boundMap = mapAny;
  boundHandler = onCamera;
}

/** Mapbox `text-field` for a feature attribute. */
export function siMap3DFeatureLabelTextField(field: string): unknown {
  return ['to-string', ['coalesce', ['get', field], '']];
}

export const SI_MAPBOX_LINE_LABEL_FILTER: unknown[] = [
  'in',
  ['geometry-type'],
  ['literal', ['LineString', 'MultiLineString']],
];

export function arcgisLabelingInfoFromLayerDefinition(layerDefinition: unknown): unknown {
  if (!layerDefinition || typeof layerDefinition !== 'object') return null;
  const def = layerDefinition as Record<string, unknown>;
  if (def.labelingInfo) return def.labelingInfo;
  const drawingInfo = def.drawingInfo;
  if (drawingInfo && typeof drawingInfo === 'object') {
    const labeling = (drawingInfo as Record<string, unknown>).labelingInfo;
    if (labeling) return labeling;
  }
  return null;
}

export function fieldNamesFromArcgisLayerDefinition(layerDefinition: unknown): string[] {
  if (!layerDefinition || typeof layerDefinition !== 'object') return [];
  const fields = (layerDefinition as { fields?: Array<{ name?: string }> }).fields;
  if (!Array.isArray(fields)) return [];
  return fields.map(f => f?.name).filter((n): n is string => typeof n === 'string' && Boolean(n.trim()));
}

/** Apply full layout + paint to an existing symbol layer (keeps 3D props in sync). */
export function applySiMap3DSymbolLayerStyle(
  map: MapboxMap,
  layerId: string,
  layout: Record<string, unknown>,
  paint: Record<string, unknown>,
): void {
  if (!map.getLayer(layerId)) return;
  for (const [key, value] of Object.entries(layout)) {
    try {
      map.setLayoutProperty(layerId, key, value);
    } catch {
      /* unsupported on this style */
    }
  }
  for (const [key, value] of Object.entries(paint)) {
    try {
      map.setPaintProperty(layerId, key, value);
    } catch {
      /* unsupported on this style */
    }
  }
}
