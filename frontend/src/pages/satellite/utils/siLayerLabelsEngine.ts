/**
 * Vector layer labels — draft normalization, Mapbox layout/paint, revision keys.
 */
import type { LayerLabelAlign, LayerLabelConfig, LayerLabelFontStyle } from '../layerTypes';
import { getGeoJsonFields } from '../symbologyHelpers';
import { propertyGetExpression } from '../../../lib/arcgisDrawingInfoMapbox';
import {
  arcgisLabelingInfoFromLayerDefinition,
  fieldNamesFromArcgisLayerDefinition,
  inferSiMapFeatureLabelField,
  siMap2DLabelPaint,
  siMap3DLabelPaint,
  siMap3DLabelTextSize,
  siMap3DLabelZoomRangeFromArcgis,
  siMap3DLineLabelLayout,
  siMap3DPointLabelLayout,
  SI_3D_LABEL_MAX_ZOOM,
  SI_3D_LABEL_MIN_ZOOM,
  SI_MAPBOX_GLYPH_FONT_STACK,
  SI_MAPBOX_LINE_LABEL_FILTER,
} from './siMap3DLabels';

export type SiLayerLabelsDraft = Required<
  Pick<LayerLabelConfig, 'enabled' | 'field' | 'fontSize' | 'color'>
> &
  Pick<LayerLabelConfig, 'fontStyle' | 'align' | 'opacity' | 'haloColor' | 'userConfigured'>;

export const SI_LABEL_DEFAULT_COLOR = '#f8fafc';
export const SI_LABEL_DEFAULT_HALO = 'rgba(2, 6, 23, 0.92)';

export function defaultSiLayerLabelsDraft(): SiLayerLabelsDraft {
  return {
    enabled: false,
    field: '',
    fontSize: 12,
    color: SI_LABEL_DEFAULT_COLOR,
    fontStyle: 'regular',
    align: 'center',
    opacity: 0.96,
    haloColor: SI_LABEL_DEFAULT_HALO,
  };
}

const clampFontSize = (n: number) => Math.max(8, Math.min(28, Math.round(Number.isFinite(n) ? n : 12)));
const clampOpacity = (n: number) => Math.max(0.1, Math.min(1, Number.isFinite(n) ? n : 0.96));

export function normalizeSiLayerLabelsDraft(
  geojson: unknown,
  raw?: LayerLabelConfig | SiLayerLabelsDraft | null,
): SiLayerLabelsDraft {
  const fields = getGeoJsonFields(geojson);
  const cfgField = typeof raw?.field === 'string' ? raw.field.trim() : '';
  const field =
    fields.length > 0
      ? cfgField && fields.includes(cfgField)
        ? cfgField
        : fields[0] ?? ''
      : cfgField;
  const align = raw?.align;
  const validAlign: LayerLabelAlign =
    align === 'left' || align === 'right' || align === 'center' ? align : 'center';
  const fs = raw?.fontStyle;
  const validStyle: LayerLabelFontStyle =
    fs === 'bold' || fs === 'italic' || fs === 'bold-italic' || fs === 'regular' ? fs : 'regular';
  const color = typeof raw?.color === 'string' && raw.color.trim() ? raw.color.trim() : SI_LABEL_DEFAULT_COLOR;
  return {
    userConfigured: raw?.userConfigured,
    enabled: Boolean(raw?.enabled) && Boolean(field),
    field,
    fontSize: clampFontSize(typeof raw?.fontSize === 'number' ? raw.fontSize : 12),
    color,
    fontStyle: validStyle,
    align: validAlign,
    opacity: clampOpacity(typeof raw?.opacity === 'number' ? raw.opacity : 0.96),
    haloColor:
      typeof raw?.haloColor === 'string' && raw.haloColor.trim() ? raw.haloColor.trim() : SI_LABEL_DEFAULT_HALO,
  };
}

export function labelConfigFromLayer(layer: {
  geojson?: unknown;
  labels?: LayerLabelConfig | null;
  arcgisLayerDefinition?: unknown;
  color?: string;
}): SiLayerLabelsDraft {
  if (layer.labels?.userConfigured) {
    return normalizeSiLayerLabelsDraft(layer.geojson, layer.labels);
  }
  const labelingInfo = arcgisLabelingInfoFromLayerDefinition(layer.arcgisLayerDefinition);
  const arcgisFields = fieldNamesFromArcgisLayerDefinition(layer.arcgisLayerDefinition);
  const inferred = inferSiMapFeatureLabelField(arcgisFields, labelingInfo, layer.geojson);
  const base = defaultSiLayerLabelsDraft();
  return normalizeSiLayerLabelsDraft(layer.geojson, {
    ...base,
    field: inferred ?? base.field,
    color: layer.color?.trim() || base.color,
    enabled: false,
  });
}

export function layerLabelConfigFromDraft(
  draft: SiLayerLabelsDraft,
  geojson?: unknown,
): LayerLabelConfig {
  const normalized = normalizeSiLayerLabelsDraft(geojson ?? null, draft);
  return {
    userConfigured: true,
    enabled: normalized.enabled,
    field: normalized.field,
    fontSize: normalized.fontSize,
    color: normalized.color,
    fontStyle: normalized.fontStyle,
    align: normalized.align,
    opacity: normalized.opacity,
    haloColor: normalized.haloColor,
  };
}

export function computeSiLayerLabelRevision(labels?: LayerLabelConfig | SiLayerLabelsDraft | null): string {
  if (!labels?.enabled) return 'lbl|0';
  const n = normalizeSiLayerLabelsDraft(null, labels);
  return [
    'lbl|1',
    n.field,
    String(n.fontSize),
    n.color,
    n.fontStyle ?? 'regular',
    n.align ?? 'center',
    String(n.opacity ?? 1),
    n.haloColor ?? '',
  ].join('|');
}

export function siMapboxLabelFontStack(fontStyle?: LayerLabelFontStyle): string[] {
  const base = [...SI_MAPBOX_GLYPH_FONT_STACK];
  if (fontStyle === 'bold' || fontStyle === 'bold-italic') {
    return ['Open Sans Bold', 'Arial Unicode MS Bold', ...base.filter(f => !f.toLowerCase().includes('bold'))];
  }
  return base;
}

function textAnchorFromAlign(align: LayerLabelAlign): string {
  if (align === 'left') return 'left';
  if (align === 'right') return 'right';
  return 'center';
}

function textOffsetFromAlign(align: LayerLabelAlign): [number, number] {
  if (align === 'left') return [0.8, 0];
  if (align === 'right') return [-0.8, 0];
  return [0, -0.35];
}

/** 2D-friendly point labels (flat map / low pitch). */
export function siMap2DPointLabelLayout(opts: {
  textField: unknown;
  baseSizePx: number;
  align?: LayerLabelAlign;
  textFont?: string[];
}) {
  const anchor = textAnchorFromAlign(opts.align ?? 'center');
  const offset = textOffsetFromAlign(opts.align ?? 'center');
  return {
    'symbol-placement': 'point' as const,
    'text-field': opts.textField,
    'text-font': opts.textFont ?? [...SI_MAPBOX_GLYPH_FONT_STACK],
    'text-size': siMap3DLabelTextSize(opts.baseSizePx),
    'text-anchor': anchor,
    'text-offset': offset,
    'text-padding': 2,
    'text-pitch-alignment': 'viewport' as const,
    'text-rotation-alignment': 'viewport' as const,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-optional': false,
  };
}

export function siMap2DLineLabelLayout(opts: {
  textField: unknown;
  baseSizePx: number;
  spacing?: number;
  textFont?: string[];
}) {
  return {
    'symbol-placement': 'line' as const,
    'symbol-spacing': opts.spacing ?? 280,
    'text-field': opts.textField,
    'text-font': opts.textFont ?? [...SI_MAPBOX_GLYPH_FONT_STACK],
    'text-size': siMap3DLabelTextSize(opts.baseSizePx),
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

export type SiMapLayerLabelRenderSpec = {
  enabled: boolean;
  field: string;
  textField: unknown;
  nonEmptyFilter: unknown;
  pointLayout: Record<string, unknown>;
  lineLayout: Record<string, unknown>;
  polygonLayout: Record<string, unknown>;
  paint: Record<string, unknown>;
  minzoom: number;
  maxzoom: number;
};

export function buildSiMapLayerLabelRenderSpec(opts: {
  config: SiLayerLabelsDraft;
  is3D: boolean;
  arcgisLayerDefinition?: unknown;
  textFont?: string[];
}): SiMapLayerLabelRenderSpec | null {
  const cfg = normalizeSiLayerLabelsDraft(null, opts.config);
  if (!cfg.enabled || !cfg.field) return null;

  const labelingInfo = arcgisLabelingInfoFromLayerDefinition(opts.arcgisLayerDefinition);
  const zoomRange = siMap3DLabelZoomRangeFromArcgis(labelingInfo);
  const textField: unknown = ['to-string', ['coalesce', propertyGetExpression(cfg.field), '']];
  const nonEmptyLabel: unknown = ['!=', textField, ''];
  const fonts = opts.textFont ?? siMapboxLabelFontStack(cfg.fontStyle);
  const paint2d = siMap2DLabelPaint(cfg.color, { haloColor: cfg.haloColor, opacity: cfg.opacity });
  const paint3d = siMap3DLabelPaint(cfg.color, { haloColor: cfg.haloColor, opacity: cfg.opacity });

  if (opts.is3D) {
    return {
      enabled: true,
      field: cfg.field,
      textField,
      nonEmptyFilter: nonEmptyLabel,
      pointLayout: siMap3DPointLabelLayout({ textField, baseSizePx: cfg.fontSize, textFont: fonts }),
      lineLayout: siMap3DLineLabelLayout({ textField, baseSizePx: cfg.fontSize, spacing: 340, textFont: fonts }),
      polygonLayout: siMap3DPointLabelLayout({ textField, baseSizePx: cfg.fontSize, textFont: fonts }),
      paint: paint3d,
      minzoom: zoomRange.minzoom ?? SI_3D_LABEL_MIN_ZOOM,
      maxzoom: zoomRange.maxzoom ?? SI_3D_LABEL_MAX_ZOOM,
    };
  }

  return {
    enabled: true,
    field: cfg.field,
    textField,
    nonEmptyFilter: nonEmptyLabel,
    pointLayout: siMap2DPointLabelLayout({
      textField,
      baseSizePx: cfg.fontSize,
      align: cfg.align,
      textFont: fonts,
    }),
    lineLayout: siMap2DLineLabelLayout({ textField, baseSizePx: cfg.fontSize, textFont: fonts }),
    polygonLayout: siMap2DPointLabelLayout({
      textField,
      baseSizePx: cfg.fontSize,
      align: cfg.align,
      textFont: fonts,
    }),
    paint: paint2d,
    minzoom: zoomRange.minzoom ?? 0,
    maxzoom: zoomRange.maxzoom ?? 24,
  };
}

/** User labels, live preview draft, or legacy 3D ArcGIS inference. */
export function resolveSiMapLayerLabelDraft(
  layer: {
    geojson?: unknown;
    labels?: LayerLabelConfig | null;
    arcgisLayerDefinition?: unknown;
    color?: string;
  },
  previewDraft?: SiLayerLabelsDraft | null,
  is3D?: boolean,
): SiLayerLabelsDraft | null {
  if (previewDraft) {
    const n = normalizeSiLayerLabelsDraft(layer.geojson, previewDraft);
    return n.enabled && n.field ? n : null;
  }
  if (layer.labels?.userConfigured) {
    const n = normalizeSiLayerLabelsDraft(layer.geojson, layer.labels);
    return n.enabled && n.field ? n : null;
  }
  if (is3D) {
    const labelingInfo = arcgisLabelingInfoFromLayerDefinition(layer.arcgisLayerDefinition);
    const arcgisFields = fieldNamesFromArcgisLayerDefinition(layer.arcgisLayerDefinition);
    const field = inferSiMapFeatureLabelField(arcgisFields, labelingInfo, layer.geojson);
    if (!field) return null;
    return normalizeSiLayerLabelsDraft(layer.geojson, {
      enabled: true,
      field,
      fontSize: 11,
      color: layer.color?.trim() || SI_LABEL_DEFAULT_COLOR,
      fontStyle: 'regular',
      align: 'center',
      opacity: 0.96,
      haloColor: SI_LABEL_DEFAULT_HALO,
    });
  }
  return null;
}
