/** Spatial scope filters for Quick Dashboard — viewport, AOI, selection. */

import { pointInPolygonGeometry } from '../drawingUtils';

export type SiQuickDashboardScopeMode = 'all' | 'viewport' | 'aoi' | 'selection';

export type LngLatBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function featureRepresentativeLngLat(feature: GeoJSON.Feature): [number, number] | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === 'Point') {
    const c = g.coordinates;
    if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) return [c[0], c[1]];
    return null;
  }
  if (g.type === 'MultiPoint' && g.coordinates[0]?.length >= 2) {
    const c = g.coordinates[0];
    return [c[0], c[1]];
  }
  if (g.type === 'LineString' && g.coordinates.length) {
    const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
    if (mid && mid.length >= 2) return [mid[0], mid[1]];
  }
  if (g.type === 'Polygon' && g.coordinates[0]?.length) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const c of g.coordinates[0]) {
      if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        sx += c[0];
        sy += c[1];
        n++;
      }
    }
    if (n) return [sx / n, sy / n];
  }
  if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) {
      const ring = poly[0];
      if (!ring?.length) continue;
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const c of ring) {
        if (c.length >= 2) {
          sx += c[0];
          sy += c[1];
          n++;
        }
      }
      if (n) return [sx / n, sy / n];
    }
  }
  return null;
}

export function featureInBounds(lng: number, lat: number, bounds: LngLatBounds): boolean {
  return lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

export function featureIntersectsAoi(feature: GeoJSON.Feature, aoi: GeoJSON.Feature | null | undefined): boolean {
  if (!aoi?.geometry) return true;
  const pt = featureRepresentativeLngLat(feature);
  if (!pt) return false;
  const [lng, lat] = pt;
  const geom = aoi.geometry;
  if (geom.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geom as { type: string; coordinates: number[][][] });
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: poly as number[][][] }),
    );
  }
  return false;
}

export function filterFeaturesForQuickDashboard(args: {
  features: GeoJSON.Feature[];
  mode: SiQuickDashboardScopeMode;
  bounds?: LngLatBounds | null;
  aoi?: GeoJSON.Feature | null;
  selectedKeys?: Set<string> | null;
  keyForFeature?: (feature: GeoJSON.Feature, index: number) => string;
  maxFeatures?: number;
}): GeoJSON.Feature[] {
  const cap = Math.min(8000, Math.max(100, args.maxFeatures ?? 4000));
  let list = args.features;

  if (args.mode === 'selection' && args.selectedKeys?.size && args.keyForFeature) {
    list = list.filter((f, i) => args.selectedKeys!.has(args.keyForFeature!(f, i)));
  } else if (args.mode === 'viewport' && args.bounds) {
    const b = args.bounds;
    list = list.filter(f => {
      const pt = featureRepresentativeLngLat(f);
      if (!pt) return false;
      return featureInBounds(pt[0], pt[1], b);
    });
  } else if (args.mode === 'aoi' && args.aoi) {
    list = list.filter(f => featureIntersectsAoi(f, args.aoi));
  }

  if (list.length > cap) {
    const step = Math.ceil(list.length / cap);
    const sampled: GeoJSON.Feature[] = [];
    for (let i = 0; i < list.length; i += step) sampled.push(list[i]!);
    return sampled;
  }
  return list;
}
