/** ArcGIS-style map feature selection — query, merge, stats. */

import type { Map as MapboxMap } from 'mapbox-gl';
import { computeStableGisFeatureKey } from '../../../lib/gisFeatureStableKey';
import {
  dedupePreparedIdentifyHits,
  prepareMapIdentifyHit,
  rankIdentifyHits,
  siMapboxLayerIdToAppLayerId,
  type MapboxIdentifyFeature,
} from '../siMapFeatureIdentify';

export type SiMapSelectionTool =
  | 'off'
  | 'click'
  | 'rectangle'
  | 'polygon'
  | 'circle'
  | 'lasso'
  | 'line'
  | 'extent'
  | 'attribute'
  | 'spatial';

export type SiSelectionMergeMode = 'replace' | 'add' | 'remove' | 'only';

export type SiMapSelectionEntry = {
  layerId: string;
  layerName: string;
  rowKey: string;
  featureLinkKey: string;
  feature: GeoJSON.Feature;
  geometryType: string;
};

export type SiMapSelectionSummary = {
  total: number;
  layerCounts: { layerId: string; layerName: string; count: number }[];
  totalAreaHa: number | null;
  totalLengthKm: number | null;
  numericStats: { field: string; min: number; max: number; avg: number; count: number }[];
};

export type CustomLayerSelectionLite = {
  id: string;
  name: string;
  visible?: boolean;
  geojson?: { features?: GeoJSON.Feature[] };
};

function computeRowKey(feature: GeoJSON.Feature, idx: number): string {
  const direct = (feature as { id?: unknown }).id;
  if (direct != null && direct !== '') return String(direct);
  const props = feature.properties;
  if (props && typeof props === 'object') {
    const candidates = ['OBJECTID', 'ObjectId', 'objectid', 'FID', 'fid', 'Id', 'ID', 'id'];
    for (const k of candidates) {
      const v = (props as Record<string, unknown>)[k];
      if (v != null && v !== '') return `${k}:${String(v)}`;
    }
  }
  return `idx:${idx}`;
}

function ringAreaM2(ring: number[][]): number {
  if (ring.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a / 2) * 111320 * 111320 * Math.cos(((ring[0]?.[1] ?? 0) * Math.PI) / 180);
}

function featureAreaHa(feature: GeoJSON.Feature): number | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === 'Polygon' && g.coordinates[0]?.length) {
    return ringAreaM2(g.coordinates[0] as number[][]) / 10000;
  }
  if (g.type === 'MultiPolygon') {
    let sum = 0;
    for (const poly of g.coordinates) {
      const ring = poly[0] as number[][] | undefined;
      if (ring?.length) sum += ringAreaM2(ring);
    }
    return sum / 10000;
  }
  return null;
}

function featureLengthKm(feature: GeoJSON.Feature): number | null {
  const g = feature.geometry;
  if (!g) return null;
  const lineLen = (coords: number[][]) => {
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      const [x0, y0] = coords[i - 1]!;
      const [x1, y1] = coords[i]!;
      const dx = (x1 - x0) * 111320 * Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
      const dy = (y1 - y0) * 111320;
      d += Math.sqrt(dx * dx + dy * dy);
    }
    return d / 1000;
  };
  if (g.type === 'LineString') return lineLen(g.coordinates as number[][]);
  if (g.type === 'MultiLineString') {
    return g.coordinates.reduce((s, line) => s + lineLen(line as number[][]), 0);
  }
  return null;
}

export function buildSiMapSelectionSummary(entries: SiMapSelectionEntry[]): SiMapSelectionSummary {
  const layerMap = new Map<string, { layerName: string; count: number }>();
  let totalAreaHa = 0;
  let areaCount = 0;
  let totalLengthKm = 0;
  let lengthCount = 0;
  const numericBuckets = new Map<string, number[]>();

  for (const e of entries) {
    const prev = layerMap.get(e.layerId);
    layerMap.set(e.layerId, { layerName: e.layerName, count: (prev?.count ?? 0) + 1 });
    const a = featureAreaHa(e.feature);
    if (a != null) {
      totalAreaHa += a;
      areaCount++;
    }
    const len = featureLengthKm(e.feature);
    if (len != null) {
      totalLengthKm += len;
      lengthCount++;
    }
    const props = e.feature.properties;
    if (props && typeof props === 'object') {
      for (const [k, v] of Object.entries(props)) {
        if (k.startsWith('_') || k.startsWith('mapbox_')) continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!Number.isFinite(n)) continue;
        const arr = numericBuckets.get(k) ?? [];
        arr.push(n);
        numericBuckets.set(k, arr);
      }
    }
  }

  const numericStats = [...numericBuckets.entries()]
    .map(([field, vals]) => {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
      return { field, min, max, avg, count: vals.length };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    total: entries.length,
    layerCounts: [...layerMap.entries()].map(([layerId, v]) => ({
      layerId,
      layerName: v.layerName,
      count: v.count,
    })),
    totalAreaHa: areaCount > 0 ? totalAreaHa : null,
    totalLengthKm: lengthCount > 0 ? totalLengthKm : null,
    numericStats,
  };
}

export function mergeSiMapSelectionEntries(
  current: SiMapSelectionEntry[],
  incoming: SiMapSelectionEntry[],
  mode: SiSelectionMergeMode,
): SiMapSelectionEntry[] {
  const keyOf = (e: SiMapSelectionEntry) => e.featureLinkKey;
  const curMap = new Map(current.map(e => [keyOf(e), e]));

  if (mode === 'replace' || mode === 'only') {
    const next = new Map<string, SiMapSelectionEntry>();
    for (const e of incoming) next.set(keyOf(e), e);
    return [...next.values()];
  }

  if (mode === 'add') {
    for (const e of incoming) curMap.set(keyOf(e), e);
    return [...curMap.values()];
  }

  if (mode === 'remove') {
    for (const e of incoming) curMap.delete(keyOf(e));
    return [...curMap.values()];
  }

  return current;
}

export function invertSiMapSelectionEntries(
  allLayerFeatures: { layerId: string; layerName: string; features: GeoJSON.Feature[] }[],
  selected: SiMapSelectionEntry[],
): SiMapSelectionEntry[] {
  const selectedKeys = new Set(selected.map(e => e.featureLinkKey));
  const out: SiMapSelectionEntry[] = [];
  for (const layer of allLayerFeatures) {
    layer.features.forEach((ft, idx) => {
      if (!ft?.geometry) return;
      const stable = computeStableGisFeatureKey(ft, idx);
      const link = `${layer.layerId}::${stable}`;
      if (selectedKeys.has(link)) return;
      out.push({
        layerId: layer.layerId,
        layerName: layer.layerName,
        rowKey: computeRowKey(ft, idx),
        featureLinkKey: link,
        feature: ft,
        geometryType: ft.geometry?.type ?? 'Unknown',
      });
    });
  }
  return out;
}

export function selectAllLayerEntries(
  layers: CustomLayerSelectionLite[],
): SiMapSelectionEntry[] {
  const out: SiMapSelectionEntry[] = [];
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const feats = layer.geojson?.features ?? [];
    feats.forEach((ft, idx) => {
      if (!ft?.geometry) return;
      const stable = computeStableGisFeatureKey(ft, idx);
      out.push({
        layerId: String(layer.id),
        layerName: layer.name,
        rowKey: computeRowKey(ft, idx),
        featureLinkKey: `${layer.id}::${stable}`,
        feature: ft,
        geometryType: ft.geometry?.type ?? 'Unknown',
      });
    });
  }
  return out;
}

export function syncTableKeysFromSelection(
  entries: SiMapSelectionEntry[],
  activeLayerId: string | null | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!activeLayerId) return keys;
  for (const e of entries) {
    if (e.layerId === String(activeLayerId)) keys.add(e.rowKey);
  }
  return keys;
}

export function queryRenderedFeaturesInBounds(
  map: MapboxMap,
  west: number,
  south: number,
  east: number,
  north: number,
  layerIds: string[],
): MapboxIdentifyFeature[] {
  if (!layerIds.length) return [];
  try {
    const minLng = Math.min(west, east);
    const maxLng = Math.max(west, east);
    const minLat = Math.min(south, north);
    const maxLat = Math.max(south, north);
    const box: [[number, number], [number, number]] = [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
    const hits = map.queryRenderedFeatures(box, { layers: layerIds }) as MapboxIdentifyFeature[];
    return rankIdentifyHits(hits ?? []);
  } catch {
    return [];
  }
}

export function queryRenderedFeaturesAtPoint(
  map: MapboxMap,
  lng: number,
  lat: number,
  layerIds: string[],
): MapboxIdentifyFeature[] {
  if (!layerIds.length) return [];
  try {
    const hits = map.queryRenderedFeatures([lng, lat], { layers: layerIds }) as MapboxIdentifyFeature[];
    return rankIdentifyHits(hits ?? []);
  } catch {
    return [];
  }
}

export function resolveSelectionEntriesFromHits(
  hits: MapboxIdentifyFeature[],
  layers: CustomLayerSelectionLite[],
  resolveTitle: (layerId: string) => string,
): SiMapSelectionEntry[] {
  const prepared = dedupePreparedIdentifyHits(
    hits
      .map(h => prepareMapIdentifyHit(h, resolveTitle))
      .filter((x): x is NonNullable<typeof x> => x != null),
  );

  const out: SiMapSelectionEntry[] = [];
  const seen = new Set<string>();

  for (const hit of prepared) {
    const layer = layers.find(l => String(l.id) === hit.baseLayerId);
    const feats = layer?.geojson?.features ?? [];
    let matched: { feature: GeoJSON.Feature; idx: number } | null = null;

    for (let i = 0; i < feats.length; i++) {
      const ft = feats[i];
      if (!ft?.geometry) continue;
      const props = ft.properties ?? {};
      const hitEntries = Object.entries(hit.properties);
      const match = hitEntries.every(([k, v]) => {
        if (k.startsWith('mapbox_')) return true;
        return String((props as Record<string, unknown>)[k] ?? '') === String(v ?? '');
      });
      if (match && hitEntries.length > 0) {
        matched = { feature: ft, idx: i };
        break;
      }
    }

    if (!matched && feats.length === 1 && feats[0]?.geometry) {
      matched = { feature: feats[0]!, idx: 0 };
    }

    const stable = matched
      ? computeStableGisFeatureKey(matched.feature, matched.idx)
      : computeStableGisFeatureKey({ properties: hit.properties }, 0);
    const link = `${hit.baseLayerId}::${stable}`;
    if (seen.has(link)) continue;
    seen.add(link);

    const feature: GeoJSON.Feature = matched?.feature ?? {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: hit.properties,
    };

    out.push({
      layerId: hit.baseLayerId,
      layerName: resolveTitle(hit.baseLayerId),
      rowKey: matched ? computeRowKey(matched.feature, matched.idx) : stable,
      featureLinkKey: link,
      feature,
      geometryType: feature.geometry?.type ?? siMapboxLayerIdToAppLayerId(hit.layerId),
    });
  }

  return out;
}

export function selectionEntriesToGeoJson(entries: SiMapSelectionEntry[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: entries
      .filter(e => e.feature?.geometry)
      .map((e, i) => ({
        type: 'Feature' as const,
        geometry: e.feature.geometry!,
        properties: {
          ...(typeof e.feature.properties === 'object' ? e.feature.properties : {}),
          _selLayer: e.layerName,
          _selKey: e.featureLinkKey,
          _selIdx: i,
        },
      })),
  };
}

export function siMapSelectionToolActive(tool: SiMapSelectionTool): boolean {
  return tool !== 'off';
}

export function selectionEntriesToCsv(entries: SiMapSelectionEntry[]): string {
  const fieldSet = new Set<string>();
  for (const e of entries) {
    const props = e.feature.properties;
    if (!props || typeof props !== 'object') continue;
    for (const k of Object.keys(props)) {
      if (!k.startsWith('_') && !k.startsWith('mapbox_')) fieldSet.add(k);
    }
  }
  const fields = ['_layer', '_geometryType', ...[...fieldSet].sort()];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map(e => {
    const props = (e.feature.properties ?? {}) as Record<string, unknown>;
    return fields
      .map(f => {
        if (f === '_layer') return esc(e.layerName);
        if (f === '_geometryType') return esc(e.geometryType);
        return esc(props[f]);
      })
      .join(',');
  });
  return [fields.join(','), ...rows].join('\n');
}

export function downloadSelectionBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
