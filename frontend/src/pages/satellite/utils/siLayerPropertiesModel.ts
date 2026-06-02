import { computeCustomLayerExtentBounds, countGeoJsonFeatures } from './siMapCustomLayerRegistry';

export type SiLayerPropertiesRow = {
  label: string;
  value: string;
  mono?: boolean;
};

export type SiLayerPropertiesSection = {
  title: string;
  rows: SiLayerPropertiesRow[];
};

export type SiLayerPropertiesInput = {
  id: string;
  name: string;
  visible: boolean;
  source?: string;
  sourceUrl?: string;
  arcgisLayerId?: number;
  renderMode?: 'vector' | 'raster' | 'bim';
  geojson?: unknown;
  importMetadata?: {
    format?: string;
    crs?: string;
    bytes?: number;
    generatedBy?: string;
    indexLayer?: string;
    imageryDate?: string;
    widthPx?: number;
    heightPx?: number;
  };
  extentBounds?: [number, number, number, number] | null;
  layerGroup?: string;
  mapOpacity?: number;
  loadStatus?: string;
  symbology?: {
    style?: string;
    field?: string;
    userConfigured?: boolean;
    useArcGisOnline?: boolean;
  };
  labels?: { enabled?: boolean; field?: string } | null;
  useArcGisSymbology?: boolean;
  ephemeral?: boolean;
  lastMapSyncAt?: number;
  lastMapSyncError?: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  arcgis: 'ArcGIS Feature Service',
  upload: 'File upload',
  api: 'Web API',
  stac: 'STAC connection',
  generated: 'Generated layer',
};

const RENDER_LABELS: Record<string, string> = {
  vector: 'Vector',
  raster: 'Raster',
  bim: 'BIM / IFC',
};

const STYLE_LABELS: Record<string, string> = {
  color: 'Single symbol',
  single: 'Single symbol',
  unique: 'Unique values',
  classified: 'Class breaks',
  heatmap: 'Heat map',
};

function formatCoord(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : '—';
}

export function formatSiLayerExtentBounds(bounds: [number, number, number, number] | null | undefined): string {
  if (!bounds || bounds.length !== 4) return 'Not available';
  const [w, s, e, n] = bounds;
  if (![w, s, e, n].every(Number.isFinite)) return 'Not available';
  return `W ${formatCoord(w)}°, S ${formatCoord(s)}°, E ${formatCoord(e)}°, N ${formatCoord(n)}°`;
}

export function resolveSiLayerCrs(layer: SiLayerPropertiesInput): string {
  const metaCrs = layer.importMetadata?.crs?.trim();
  if (metaCrs) return metaCrs;
  const gj = layer.geojson as { crs?: { properties?: { name?: string }; type?: string } } | null | undefined;
  const crsName = gj?.crs?.properties?.name?.trim();
  if (crsName) return crsName;
  return 'EPSG:4326 (WGS84)';
}

function resolveSourceLabel(layer: SiLayerPropertiesInput): string {
  if (layer.importMetadata?.format === 'GeoTIFF' || layer.renderMode === 'raster') return 'GeoTIFF raster';
  if (layer.importMetadata?.format === 'IFC' || layer.renderMode === 'bim') return 'IFC (BIM)';
  if (layer.source && SOURCE_LABELS[layer.source]) return SOURCE_LABELS[layer.source]!;
  if (layer.source) return layer.source;
  return layer.renderMode === 'raster' ? 'Raster' : 'Vector';
}

function resolveSymbologySummary(layer: SiLayerPropertiesInput): string {
  if (layer.renderMode === 'raster') return 'Raster — use map Symbology tool';
  if (layer.useArcGisSymbology || layer.symbology?.useArcGisOnline) return 'ArcGIS service symbology';
  const style = layer.symbology?.style;
  const base = style ? STYLE_LABELS[style] ?? style : 'Single symbol';
  const field = layer.symbology?.field?.trim();
  if (field && style && style !== 'color' && style !== 'single') return `${base} · ${field}`;
  if (layer.symbology?.userConfigured) return `${base} (custom)`;
  return base;
}

function resolveLabelsSummary(layer: SiLayerPropertiesInput): string {
  if (layer.renderMode === 'raster' || layer.renderMode === 'bim') return 'Not applicable';
  if (layer.labels?.enabled) {
    const field = layer.labels.field?.trim();
    return field ? `On · ${field}` : 'On';
  }
  return 'Off';
}

function resolveLoadStatus(layer: SiLayerPropertiesInput): string {
  switch (layer.loadStatus) {
    case 'loading':
      return 'Loading';
    case 'loaded':
      return 'Ready';
    case 'failed':
      return layer.lastMapSyncError ? `Failed — ${layer.lastMapSyncError}` : 'Failed';
    case 'empty':
      return 'No features';
    default:
      return 'Ready';
  }
}

function pushRow(rows: SiLayerPropertiesRow[], label: string, value: string, mono = false): void {
  const v = value.trim();
  if (!v) return;
  rows.push({ label, value: v, mono });
}

export function buildSiLayerPropertiesSections(layer: SiLayerPropertiesInput): SiLayerPropertiesSection[] {
  const featureCount = countGeoJsonFeatures(layer.geojson);
  const extent = computeCustomLayerExtentBounds(layer);
  const opacity =
    typeof layer.mapOpacity === 'number' && Number.isFinite(layer.mapOpacity)
      ? `${Math.round(layer.mapOpacity * 100)}%`
      : '100%';

  const overview: SiLayerPropertiesRow[] = [];
  pushRow(overview, 'Name', layer.name);
  pushRow(overview, 'Layer type', RENDER_LABELS[layer.renderMode ?? 'vector'] ?? 'Vector');
  pushRow(overview, 'Source', resolveSourceLabel(layer));
  if (layer.sourceUrl?.trim()) {
    pushRow(overview, 'Source URL', layer.sourceUrl.trim(), true);
  }
  if (layer.arcgisLayerId != null) {
    pushRow(overview, 'Service layer ID', String(layer.arcgisLayerId), true);
  }
  if (layer.importMetadata?.format) {
    pushRow(overview, 'Format', layer.importMetadata.format);
  }

  const spatial: SiLayerPropertiesRow[] = [];
  pushRow(spatial, 'CRS', resolveSiLayerCrs(layer));
  pushRow(spatial, 'Extent', formatSiLayerExtentBounds(extent), true);
  if (layer.renderMode !== 'raster' && layer.renderMode !== 'bim') {
    pushRow(spatial, 'Feature count', featureCount > 0 ? featureCount.toLocaleString() : '0');
  } else if (layer.importMetadata?.widthPx && layer.importMetadata?.heightPx) {
    pushRow(
      spatial,
      'Raster size',
      `${layer.importMetadata.widthPx} × ${layer.importMetadata.heightPx} px`,
    );
  }

  const settings: SiLayerPropertiesRow[] = [];
  pushRow(settings, 'Visibility', layer.visible === false ? 'Hidden' : 'Visible');
  pushRow(settings, 'Map opacity', opacity);
  if (layer.layerGroup?.trim()) pushRow(settings, 'Group', layer.layerGroup.trim());
  pushRow(settings, 'Symbology', resolveSymbologySummary(layer));
  pushRow(settings, 'Labels', resolveLabelsSummary(layer));
  pushRow(settings, 'Status', resolveLoadStatus(layer));
  if (layer.ephemeral) pushRow(settings, 'Persistence', 'Session only');
  if (layer.lastMapSyncAt) {
    pushRow(settings, 'Last sync', new Date(layer.lastMapSyncAt).toLocaleString());
  }

  const sections: SiLayerPropertiesSection[] = [];
  if (overview.length) sections.push({ title: 'Layer details', rows: overview });
  if (spatial.length) sections.push({ title: 'Spatial', rows: spatial });
  if (settings.length) sections.push({ title: 'Current settings', rows: settings });
  return sections;
}
