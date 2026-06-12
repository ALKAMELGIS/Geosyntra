/** Run map feature selection queries against rendered Mapbox layers. */

import type { Map as MapboxMap } from 'mapbox-gl';
import { pointInPolygonGeometry } from '../drawingUtils';
import {
  queryRenderedFeaturesAtPoint,
  queryRenderedFeaturesInBounds,
  resolveSelectionEntriesFromHits,
  type CustomLayerSelectionLite,
  type SiMapSelectionEntry,
} from './siMapFeatureSelection';

export type RunSatelliteMapSelectionCtx = {
  getMap: () => MapboxMap | null | undefined;
  queryableLayerIds: string[];
  customLayers: CustomLayerSelectionLite[];
  resolveTitle: (layerId: string) => string;
};

function featureCentroid(feature: GeoJSON.Feature): [number, number] | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === 'Point') {
    const c = g.coordinates;
    if (c.length >= 2) return [c[0], c[1]];
    return null;
  }
  if (g.type === 'Polygon' && g.coordinates[0]?.length) {
    const ring = g.coordinates[0] as number[][];
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const p of ring) {
      if (p.length >= 2) {
        sx += p[0]!;
        sy += p[1]!;
        n++;
      }
    }
    return n ? [sx / n, sy / n] : null;
  }
  if (g.type === 'LineString' && g.coordinates.length) {
    const mid = g.coordinates[Math.floor(g.coordinates.length / 2)] as number[];
    return mid?.length >= 2 ? [mid[0]!, mid[1]!] : null;
  }
  if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) {
      const ring = poly[0] as number[][] | undefined;
      if (!ring?.length) continue;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const p of ring) {
        if (p.length >= 2) {
          sx += p[0]!;
          sy += p[1]!;
          n++;
        }
      }
      if (n) return [sx / n, sy / n];
    }
  }
  return null;
}

function entriesInPolygon(entries: SiMapSelectionEntry[], polygon: GeoJSON.Polygon): SiMapSelectionEntry[] {
  return entries.filter(e => {
    const pt = featureCentroid(e.feature);
    if (!pt) return false;
    return pointInPolygonGeometry(pt[0], pt[1], polygon);
  });
}

function distPointToSegmentM(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const cos = Math.cos(((ay + by) / 2) * (Math.PI / 180));
  const mPerDegLng = 111320 * cos;
  const mPerDegLat = 111320;
  const dx = (bx - ax) * mPerDegLng;
  const dy = (by - ay) * mPerDegLat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) {
    const ex = (px - ax) * mPerDegLng;
    const ey = (py - ay) * mPerDegLat;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((px - ax) * mPerDegLng * dx + (py - ay) * mPerDegLat * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + (t * (bx - ax));
  const cy = ay + (t * (by - ay));
  const ex = (px - cx) * mPerDegLng;
  const ey = (py - cy) * mPerDegLat;
  return Math.sqrt(ex * ex + ey * ey);
}

function entriesNearLine(
  entries: SiMapSelectionEntry[],
  line: GeoJSON.LineString,
  bufferM: number,
): SiMapSelectionEntry[] {
  const coords = line.coordinates as number[][];
  if (coords.length < 2) return [];
  return entries.filter(e => {
    const pt = featureCentroid(e.feature);
    if (!pt) return false;
    const [px, py] = pt;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1]!;
      const b = coords[i]!;
      if (distPointToSegmentM(px, py, a[0]!, a[1]!, b[0]!, b[1]!) <= bufferM) return true;
    }
    return false;
  });
}

function allLayerEntries(layers: CustomLayerSelectionLite[]): SiMapSelectionEntry[] {
  const out: SiMapSelectionEntry[] = [];
  for (const layer of layers) {
    if (layer.visible === false) continue;
    const feats = layer.geojson?.features ?? [];
    feats.forEach((ft, idx) => {
      if (!ft?.geometry) return;
      const stable = `${layer.id}::${idx}`;
      out.push({
        layerId: String(layer.id),
        layerName: layer.name,
        rowKey: String((ft as { id?: unknown }).id ?? idx),
        featureLinkKey: stable,
        feature: ft,
        geometryType: ft.geometry?.type ?? 'Unknown',
      });
    });
  }
  return out;
}

export function runSatelliteMapSelectionAtPoint(
  ctx: RunSatelliteMapSelectionCtx,
  lng: number,
  lat: number,
): SiMapSelectionEntry[] {
  const map = ctx.getMap();
  if (!map) return [];
  const hits = queryRenderedFeaturesAtPoint(map, lng, lat, ctx.queryableLayerIds);
  return resolveSelectionEntriesFromHits(hits, ctx.customLayers, ctx.resolveTitle);
}

export function runSatelliteMapSelectionInBounds(
  ctx: RunSatelliteMapSelectionCtx,
  west: number,
  south: number,
  east: number,
  north: number,
): SiMapSelectionEntry[] {
  const map = ctx.getMap();
  if (!map) return [];
  const hits = queryRenderedFeaturesInBounds(map, west, south, east, north, ctx.queryableLayerIds);
  return resolveSelectionEntriesFromHits(hits, ctx.customLayers, ctx.resolveTitle);
}

export function runSatelliteMapSelectionExtent(ctx: RunSatelliteMapSelectionCtx): SiMapSelectionEntry[] {
  const map = ctx.getMap();
  if (!map || typeof map.getBounds !== 'function') return [];
  try {
    const b = map.getBounds();
    return runSatelliteMapSelectionInBounds(ctx, b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
  } catch {
    return [];
  }
}

export function runSatelliteMapSelectionInPolygon(
  ctx: RunSatelliteMapSelectionCtx,
  polygon: GeoJSON.Polygon,
): SiMapSelectionEntry[] {
  const ring = polygon.coordinates[0] as number[][] | undefined;
  if (!ring?.length) return [];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const c of ring) {
    if (c.length < 2) continue;
    west = Math.min(west, c[0]!);
    east = Math.max(east, c[0]!);
    south = Math.min(south, c[1]!);
    north = Math.max(north, c[1]!);
  }
  const inBox = runSatelliteMapSelectionInBounds(ctx, west, south, east, north);
  return entriesInPolygon(inBox, polygon);
}

export function runSatelliteMapSelectionAlongLine(
  ctx: RunSatelliteMapSelectionCtx,
  line: GeoJSON.LineString,
  bufferM = 40,
): SiMapSelectionEntry[] {
  const coords = line.coordinates as number[][];
  if (coords.length < 2) return [];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const c of coords) {
    if (c.length < 2) continue;
    west = Math.min(west, c[0]!);
    east = Math.max(east, c[0]!);
    south = Math.min(south, c[1]!);
    north = Math.max(north, c[1]!);
  }
  const pad = bufferM / 111320;
  const inBox = runSatelliteMapSelectionInBounds(
    ctx,
    west - pad,
    south - pad,
    east + pad,
    north + pad,
  );
  return entriesNearLine(inBox, line, bufferM);
}

export function runSatelliteMapSelectionByAttribute(
  ctx: RunSatelliteMapSelectionCtx,
  field: string,
  value: string,
  operator: 'contains' | 'equals' = 'contains',
): SiMapSelectionEntry[] {
  const needle = value.trim().toLowerCase();
  if (!field.trim() || !needle) return [];
  const out: SiMapSelectionEntry[] = [];
  for (const layer of ctx.customLayers) {
    if (layer.visible === false) continue;
    const feats = layer.geojson?.features ?? [];
    feats.forEach((ft, idx) => {
      if (!ft?.geometry) return;
      const raw = (ft.properties as Record<string, unknown> | undefined)?.[field];
      const hay = String(raw ?? '').toLowerCase();
      const match = operator === 'equals' ? hay === needle : hay.includes(needle);
      if (!match) return;
      const stable = `${layer.id}::${idx}`;
      out.push({
        layerId: String(layer.id),
        layerName: ctx.resolveTitle(String(layer.id)),
        rowKey: String((ft as { id?: unknown }).id ?? idx),
        featureLinkKey: stable,
        feature: ft,
        geometryType: ft.geometry?.type ?? 'Unknown',
      });
    });
  }
  return out;
}

export type SiSpatialRelation = 'intersects' | 'within' | 'contains' | 'touches';

export function runSatelliteMapSelectionSpatial(
  ctx: RunSatelliteMapSelectionCtx,
  reference: GeoJSON.Feature,
  relation: SiSpatialRelation = 'intersects',
): SiMapSelectionEntry[] {
  const refGeom = reference.geometry;
  if (!refGeom) return [];
  const candidates = allLayerEntries(ctx.customLayers);
  if (relation === 'within') {
    if (refGeom.type !== 'Polygon' && refGeom.type !== 'MultiPolygon') return [];
    return candidates.filter(e => {
      const pt = featureCentroid(e.feature);
      if (!pt) return false;
      if (refGeom.type === 'Polygon') {
        return pointInPolygonGeometry(pt[0], pt[1], refGeom);
      }
      return refGeom.coordinates.some(poly =>
        pointInPolygonGeometry(pt[0], pt[1], { type: 'Polygon', coordinates: poly as number[][][] }),
      );
    });
  }
  if (relation === 'contains') {
    const eGeom = reference.geometry;
    if (eGeom?.type !== 'Polygon') return [];
    return candidates.filter(e => {
      const pt = featureCentroid(e.feature);
      if (!pt) return false;
      return pointInPolygonGeometry(pt[0], pt[1], eGeom as GeoJSON.Polygon);
    });
  }
  // intersects / touches — centroid in reference bbox or polygon
  if (refGeom.type === 'Polygon') {
    return entriesInPolygon(candidates, refGeom);
  }
  const pt = featureCentroid(reference);
  if (!pt) return [];
  const map = ctx.getMap();
  if (!map) return [];
  const pad = 0.002;
  return runSatelliteMapSelectionInBounds(ctx, pt[0] - pad, pt[1] - pad, pt[0] + pad, pt[1] + pad);
}
