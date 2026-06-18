import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { LaPoint } from './siLocationAllocationTypes';

const EARTH_R = 6371000;

function laPointsNear(a: LaPoint, b: LaPoint, toleranceM = 25): boolean {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h)) <= toleranceM;
}

function pointFromGeometry(geom: Geometry | null | undefined): { lng: number; lat: number } | null {
  if (!geom) return null;
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    return null;
  }
  if (geom.type === 'MultiPoint') {
    for (const c of geom.coordinates) {
      const [lng, lat] = c;
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    }
  }
  if (geom.type === 'Polygon' && geom.coordinates[0]?.length) {
    const ring = geom.coordinates[0];
    let sx = 0;
    let sy = 0;
    const n = Math.max(1, ring.length - 1);
    for (let i = 0; i < n; i++) {
      sx += ring[i]![0]!;
      sy += ring[i]![1]!;
    }
    return { lng: sx / n, lat: sy / n };
  }
  if (geom.type === 'LineString' && geom.coordinates[0]) {
    const [lng, lat] = geom.coordinates[0];
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  return null;
}

function labelFromProps(props: Record<string, unknown> | null | undefined, fallback: string): string {
  if (!props) return fallback;
  for (const k of ['name', 'label', 'title', 'id', 'ID', 'facility', 'site']) {
    const v = props[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return fallback;
}

function weightFromProps(props: Record<string, unknown> | null | undefined): number {
  if (!props) return 1;
  for (const k of ['weight', 'demand', 'pop', 'population', 'qty', 'count']) {
    const v = Number(props[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 1;
}

/** Extract LA points from GeoJSON (Point / MultiPoint / Polygon centroid / LineString start). */
export function laPointsFromGeoJson(
  fc: FeatureCollection | Feature | null | undefined,
  prefix: string,
): LaPoint[] {
  const features: Feature[] =
    !fc ? [] : fc.type === 'FeatureCollection' ? fc.features ?? [] : [fc as Feature];
  const out: LaPoint[] = [];
  features.forEach((f, i) => {
    const pt = pointFromGeometry(f.geometry);
    if (!pt) return;
    out.push({
      id: `${prefix}-import-${i}-${pt.lng.toFixed(5)}-${pt.lat.toFixed(5)}`,
      lng: pt.lng,
      lat: pt.lat,
      label: labelFromProps(f.properties as Record<string, unknown>, `${prefix} ${i + 1}`),
      weight: weightFromProps(f.properties as Record<string, unknown>),
    });
  });
  return out;
}

export function laPointsToText(points: LaPoint[]): string {
  return points
    .map(p =>
      p.label && !p.label.startsWith(`${p.id}`)
        ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}  ; ${p.label}`
        : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    )
    .join('\n');
}

export function mergeLaPoints(existing: LaPoint[], imported: LaPoint[]): LaPoint[] {
  const merged = [...existing];
  for (const p of imported) {
    if (merged.some(e => laPointsNear(e, p))) continue;
    merged.push(p);
  }
  return merged;
}

export function fitMapToLaPoints(
  map: { fitBounds: (b: [[number, number], [number, number]], o?: object) => void } | null | undefined,
  points: LaPoint[],
  padding = 80,
): void {
  if (!map || points.length < 1) return;
  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  if (points.length === 1) {
    map.fitBounds(
      [
        [lngs[0]! - 0.02, lats[0]! - 0.02],
        [lngs[0]! + 0.02, lats[0]! + 0.02],
      ],
      { padding, duration: 700, maxZoom: 14 },
    );
    return;
  }
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding, duration: 900, maxZoom: 15 },
  );
}

export function laPointsFromCustomLayer(
  layer: { id: string; name: string; geojson?: FeatureCollection | null },
  prefix: string,
): LaPoint[] {
  return laPointsFromGeoJson(layer.geojson, `${prefix}-${layer.id}`).map((p, i) => ({
    ...p,
    label: p.label || `${layer.name} ${i + 1}`,
  }));
}

export function listLaImportableLayers(
  layers: Array<{ id: string; name: string; visible?: boolean; geojson?: FeatureCollection | null }>,
): Array<{ id: string; name: string; pointCount: number }> {
  return layers
    .filter(l => l.visible !== false && l.geojson?.features?.length)
    .map(l => ({
      id: l.id,
      name: l.name,
      pointCount: laPointsFromGeoJson(l.geojson, 'x').length,
    }))
    .filter(l => l.pointCount > 0);
}

export function buildLaInputPointsGeoJson(
  points: LaPoint[],
  role: 'la-input-facility' | 'la-input-demand',
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map(p => ({
      type: 'Feature',
      properties: {
        role,
        pointId: p.id,
        label: p.label ?? p.id,
        weight: p.weight ?? 1,
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}
