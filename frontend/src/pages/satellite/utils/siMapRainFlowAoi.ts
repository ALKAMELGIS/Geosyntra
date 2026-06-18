import type { Map as MapboxMap } from 'mapbox-gl';
import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson';
import { pointInPolygonGeometry } from '../drawingUtils';
import { getDrawnGeometry } from '../../../lib/sentinelHubWmsAoiClip';

export type RainFlowScreenRing = Array<{ x: number; y: number }>;

export function pointInRainFlowGeometry(lng: number, lat: number, geometry: Geometry): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonGeometry(lng, lat, geometry as { type: string; coordinates: number[][][] });
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).some(poly =>
      pointInPolygonGeometry(lng, lat, { type: 'Polygon', coordinates: poly }),
    );
  }
  return false;
}

export function pointInAnyRainFlowAoi(
  lng: number,
  lat: number,
  features: ReadonlyArray<Feature>,
): boolean {
  for (const f of features) {
    const g = getDrawnGeometry(f);
    if (g && pointInRainFlowGeometry(lng, lat, g)) return true;
  }
  return false;
}

/** Active + workspace AOI features for rain-flow clipping. */
export function collectRainFlowAoiFeatures(
  drawnGeometry: Feature | null | undefined,
  multiAoiItems: ReadonlyArray<{ feature?: Feature | null }>,
  normalizedDrawnGeometry?: Polygon | MultiPolygon | null,
): Feature[] {
  const out: Feature[] = [];
  const seen = new Set<string>();

  const push = (f: Feature | null | undefined) => {
    if (!f?.geometry || getDrawnGeometry(f) == null) return;
    const key = JSON.stringify(f.geometry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  push(drawnGeometry ?? null);
  for (const row of multiAoiItems) push(row.feature ?? null);
  if (normalizedDrawnGeometry) {
    const key = JSON.stringify(normalizedDrawnGeometry);
    if (!seen.has(key)) {
      out.push({ type: 'Feature', properties: {}, geometry: normalizedDrawnGeometry });
    }
  }
  return out;
}

function collectExteriorRings(geometry: Geometry): number[][][] {
  const rings: number[][][] = [];
  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates;
    if (coords[0]?.length) rings.push(coords[0]!);
    return rings;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (poly[0]?.length) rings.push(poly[0]!);
    }
  }
  return rings;
}

/** Project AOI exterior rings to map container pixel space for canvas clip. */
export function projectRainFlowAoiRings(
  map: MapboxMap,
  features: ReadonlyArray<Feature>,
): RainFlowScreenRing[] {
  const screen: RainFlowScreenRing[] = [];
  for (const f of features) {
    const g = getDrawnGeometry(f);
    if (!g) continue;
    for (const ring of collectExteriorRings(g)) {
      if (!ring.length) continue;
      const pts: RainFlowScreenRing = [];
      for (const coord of ring) {
        const lng = coord[0]!;
        const lat = coord[1]!;
        const p = map.project([lng, lat]);
        pts.push({ x: p.x, y: p.y });
      }
      if (pts.length >= 3) screen.push(pts);
    }
  }
  return screen;
}

export function clipCanvasToRainFlowAoi(
  ctx: CanvasRenderingContext2D,
  rings: ReadonlyArray<RainFlowScreenRing>,
): boolean {
  if (!rings.length) return false;
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
  }
  ctx.clip('evenodd');
  return true;
}
