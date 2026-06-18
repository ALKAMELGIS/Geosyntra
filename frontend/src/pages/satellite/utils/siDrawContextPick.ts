/** Hit-test drawn / workspace / field geometries for the draw context menu. */

import { pointInPolygonGeometry } from '../drawingUtils';

export type SiDrawContextTarget =
  | { kind: 'drawn'; label: string }
  | { kind: 'multiAoi'; aoiId: string; label: string }
  | { kind: 'field'; fieldId: string; label: string };

function ringBBoxArea(ring: number[][]): number {
  if (ring.length < 3) return Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of ring) {
    minX = Math.min(minX, c[0]!);
    maxX = Math.max(maxX, c[0]!);
    minY = Math.min(minY, c[1]!);
    maxY = Math.max(maxY, c[1]!);
  }
  return Math.max(1e-12, (maxX - minX) * (maxY - minY));
}

function geometryHitArea(geometry: GeoJSON.Geometry | null | undefined): number {
  if (!geometry) return Infinity;
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0];
    return outer ? ringBBoxArea(outer) : Infinity;
  }
  if (geometry.type === 'MultiPolygon') {
    let best = Infinity;
    for (const poly of geometry.coordinates) {
      const outer = poly[0];
      if (outer) best = Math.min(best, ringBBoxArea(outer));
    }
    return best;
  }
  if (geometry.type === 'Point') return 1e-8;
  if (geometry.type === 'LineString') return 1e-6;
  return Infinity;
}

export function featureContainsLngLat(
  lng: number,
  lat: number,
  feature: GeoJSON.Feature | null | undefined,
): boolean {
  const g = feature?.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, g as { type: string; coordinates: number[][][] });
  }
  if (g.type === 'MultiPolygon') {
    return g.coordinates.some(poly =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: poly } as {
        type: string;
        coordinates: number[][][];
      }),
    );
  }
  if (g.type === 'Point') {
    const [plng, plat] = g.coordinates as [number, number];
    return Math.hypot(lng - plng, lat - plat) < 0.00015;
  }
  if (g.type === 'LineString') {
    const coords = g.coordinates as [number, number][];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-18) continue;
      const t = Math.max(0, Math.min(1, ((lng - a[0]) * dx + (lat - a[1]) * dy) / len2));
      const px = a[0] + t * dx;
      const py = a[1] + t * dy;
      if (Math.hypot(lng - px, lat - py) < 0.00012) return true;
    }
  }
  return false;
}

export type PickDrawContextInput = {
  lng: number;
  lat: number;
  drawnFeature: GeoJSON.Feature | null | undefined;
  multiAoiRows: { id: string; name: string; feature: GeoJSON.Feature }[];
  activeMultiAoiId: string | null;
  fieldRows: { id: string; name: string; geometry: GeoJSON.Geometry }[];
  selectedFieldId: string | null;
};

export function pickDrawContextTarget(input: PickDrawContextInput): SiDrawContextTarget | null {
  const hits: { target: SiDrawContextTarget; area: number; priority: number }[] = [];

  for (const f of input.fieldRows) {
    const feat = { type: 'Feature' as const, properties: {}, geometry: f.geometry };
    if (!featureContainsLngLat(input.lng, input.lat, feat)) continue;
    hits.push({
      target: { kind: 'field', fieldId: f.id, label: f.name },
      area: geometryHitArea(f.geometry),
      priority: f.id === input.selectedFieldId ? 0 : 2,
    });
  }

  for (const row of input.multiAoiRows) {
    if (!featureContainsLngLat(input.lng, input.lat, row.feature)) continue;
    hits.push({
      target: { kind: 'multiAoi', aoiId: row.id, label: row.name },
      area: geometryHitArea(row.feature.geometry),
      priority: row.id === input.activeMultiAoiId ? 0 : 1,
    });
  }

  if (input.drawnFeature && featureContainsLngLat(input.lng, input.lat, input.drawnFeature)) {
    const label =
      String((input.drawnFeature.properties as { label?: string } | null)?.label ?? '').trim() ||
      'Drawn AOI';
    hits.push({
      target: { kind: 'drawn', label },
      area: geometryHitArea(input.drawnFeature.geometry),
      priority: input.multiAoiRows.length === 0 ? 0 : 1,
    });
  }

  if (!hits.length) return null;
  hits.sort((a, b) => a.priority - b.priority || a.area - b.area);
  return hits[0]!.target;
}
