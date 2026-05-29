/** AOI geometry editing — sparse handles, edge insert, rotate/scale transforms. */

import type { Map as MapboxMap } from 'mapbox-gl';
import {
  cloneDeep,
  collectVertexRefs,
  findNearestVertex,
  lngLatPixelDistance,
  setVertexCoord,
  translateFeatureCoordinates,
  type VertexRef,
} from '../drawingUtils';

export type AoiGeometryEditSubTool =
  | 'vertex'
  | 'addVertex'
  | 'removeVertex'
  | 'reshape'
  | 'rotate'
  | 'scale';

export type AoiEditDragState =
  | { mode: 'vertex'; ref: VertexRef }
  | { mode: 'pan'; last: [number, number] }
  | {
      mode: 'rotate';
      center: [number, number];
      startAngleRad: number;
      baseFeature: GeoJSON.Feature;
    }
  | {
      mode: 'scale';
      center: [number, number];
      startDist: number;
      baseFeature: GeoJSON.Feature;
    };

export type EdgeInsertRef = {
  kind: 'Polygon';
  ring: number;
  afterIndex: number;
  polyIndex?: number;
};

const SPARSE_DEFAULT_MAX = 16;

/** Few visible handles while preserving overall shape; full set available on demand. */
export function collectSparseVertexRefs(
  geometry: GeoJSON.Geometry | null | undefined,
  maxVertices = SPARSE_DEFAULT_MAX,
): { ref: VertexRef; coord: [number, number] }[] {
  const all = collectVertexRefs(geometry);
  if (all.length <= maxVertices) return all;
  const stride = Math.max(1, Math.ceil(all.length / maxVertices));
  const out: typeof all = [];
  for (let i = 0; i < all.length; i += stride) {
    out.push(all[i]!);
  }
  const last = all[all.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail.coord[0] !== last.coord[0] || tail.coord[1] !== last.coord[1]) {
    out.push(last);
  }
  return out;
}

export function findNearestVertexAmong(
  map: MapboxMap,
  candidates: { ref: VertexRef; coord: [number, number] }[],
  lng: number,
  lat: number,
  pxThreshold: number,
): { ref: VertexRef; coord: [number, number] } | null {
  let best: { ref: VertexRef; coord: [number, number]; d: number } | null = null;
  const click: [number, number] = [lng, lat];
  for (const p of candidates) {
    const d = lngLatPixelDistance(map, click, p.coord);
    if (d <= pxThreshold && (!best || d < best.d)) {
      best = { ...p, d };
    }
  }
  return best;
}

function ringSegments(ring: number[][]): { a: [number, number]; b: [number, number]; afterIndex: number }[] {
  const lastDup =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const n = lastDup ? ring.length - 1 : ring.length;
  const segs: { a: [number, number]; b: [number, number]; afterIndex: number }[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    segs.push({
      a: ring[i] as [number, number],
      b: ring[j] as [number, number],
      afterIndex: i,
    });
  }
  return segs;
}

export function findNearestEdgeSegment(
  map: MapboxMap,
  geometry: GeoJSON.Geometry | null | undefined,
  lng: number,
  lat: number,
  pxThreshold: number,
): { ref: EdgeInsertRef; coord: [number, number] } | null {
  if (!geometry) return null;
  const click: [number, number] = [lng, lat];
  let best: { ref: EdgeInsertRef; coord: [number, number]; d: number } | null = null;

  const considerRing = (ring: number[][], ringIndex: number, polyIndex?: number) => {
    for (const seg of ringSegments(ring)) {
      let minD = Infinity;
      let bestT = 0.5;
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        const x = seg.a[0] + t * (seg.b[0] - seg.a[0]);
        const y = seg.a[1] + t * (seg.b[1] - seg.a[1]);
        const d = lngLatPixelDistance(map, click, [x, y]);
        if (d < minD) {
          minD = d;
          bestT = t;
        }
      }
      if (minD <= pxThreshold && (!best || minD < best.d)) {
        const coord: [number, number] = [
          seg.a[0] + bestT * (seg.b[0] - seg.a[0]),
          seg.a[1] + bestT * (seg.b[1] - seg.a[1]),
        ];
        best = {
          ref: { kind: 'Polygon', ring: ringIndex, afterIndex: seg.afterIndex, polyIndex },
          coord,
          d: minD,
        };
      }
    }
  };

  if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach((ring, ringIndex) => considerRing(ring, ringIndex));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly, polyIndex) => {
      poly.forEach((ring, ringIndex) => considerRing(ring, ringIndex, polyIndex));
    });
  } else if (geometry.type === 'LineString') {
    const coords = geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const seg = {
        a: coords[i] as [number, number],
        b: coords[i + 1] as [number, number],
        afterIndex: i,
      };
      let minD = Infinity;
      let bestT = 0.5;
      for (let s = 0; s <= 12; s++) {
        const t = s / 12;
        const x = seg.a[0] + t * (seg.b[0] - seg.a[0]);
        const y = seg.a[1] + t * (seg.b[1] - seg.a[1]);
        const d = lngLatPixelDistance(map, click, [x, y]);
        if (d < minD) {
          minD = d;
          bestT = t;
        }
      }
      if (minD <= pxThreshold && (!best || minD < best.d)) {
        best = {
          ref: { kind: 'Polygon', ring: 0, afterIndex: i },
          coord: [
            seg.a[0] + bestT * (seg.b[0] - seg.a[0]),
            seg.a[1] + bestT * (seg.b[1] - seg.a[1]),
          ],
          d: minD,
        };
      }
    }
  }
  return best;
}

export function insertVertexOnEdge(feature: GeoJSON.Feature, edge: EdgeInsertRef, lng: number, lat: number): GeoJSON.Feature {
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return f;
  const pt: [number, number] = [lng, lat];

  if (g.type === 'LineString') {
    const idx = edge.afterIndex + 1;
    g.coordinates.splice(idx, 0, pt);
    return f;
  }
  if (g.type === 'Polygon' && edge.kind === 'Polygon') {
    const ring = g.coordinates[edge.ring];
    if (!ring) return f;
    const insertAt = edge.afterIndex + 1;
    ring.splice(insertAt, 0, pt);
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (lastDup) {
      ring[ring.length - 1] = [...ring[0]];
    }
    return f;
  }
  if (g.type === 'MultiPolygon' && edge.kind === 'Polygon' && edge.polyIndex != null) {
    const poly = g.coordinates[edge.polyIndex];
    if (!poly) return f;
    const ring = poly[edge.ring];
    if (!ring) return f;
    ring.splice(edge.afterIndex + 1, 0, pt);
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    if (lastDup) {
      ring[ring.length - 1] = [...ring[0]];
    }
    return f;
  }
  return f;
}

function ringUniqueVertexCount(ring: number[][]): number {
  const lastDup =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  return lastDup ? ring.length - 1 : ring.length;
}

export function removeVertexFromFeature(feature: GeoJSON.Feature, ref: VertexRef): GeoJSON.Feature | null {
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return null;

  if (g.type === 'LineString' && ref.kind === 'LineString') {
    if (g.coordinates.length <= 2) return null;
    g.coordinates.splice(ref.index, 1);
    return f;
  }
  if (g.type === 'Polygon' && ref.kind === 'Polygon') {
    const ring = g.coordinates[ref.ring];
    if (!ring || ringUniqueVertexCount(ring) <= 3) return null;
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    ring.splice(ref.index, 1);
    if (lastDup && ring.length > 0) {
      ring[ring.length - 1] = [...ring[0]];
    }
    return f;
  }
  if (g.type === 'MultiPolygon' && ref.kind === 'Polygon' && ref.polyIndex != null) {
    const poly = g.coordinates[ref.polyIndex];
    if (!poly) return null;
    const ring = poly[ref.ring];
    if (!ring || ringUniqueVertexCount(ring) <= 3) return null;
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    ring.splice(ref.index, 1);
    if (lastDup && ring.length > 0) {
      ring[ring.length - 1] = [...ring[0]];
    }
    return f;
  }
  return null;
}

export function geometryCentroid(geometry: GeoJSON.Geometry | null | undefined): [number, number] | null {
  if (!geometry) return null;
  const pts: [number, number][] = [];
  if (geometry.type === 'Point') {
    return geometry.coordinates as [number, number];
  }
  if (geometry.type === 'LineString') {
    geometry.coordinates.forEach(c => pts.push(c as [number, number]));
  } else if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    if (!ring) return null;
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const max = lastDup ? ring.length - 1 : ring.length;
    for (let i = 0; i < max; i++) pts.push(ring[i] as [number, number]);
  } else if (geometry.type === 'MultiPolygon') {
    const ring = geometry.coordinates[0]?.[0];
    if (!ring) return null;
    const lastDup =
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1];
    const max = lastDup ? ring.length - 1 : ring.length;
    for (let i = 0; i < max; i++) pts.push(ring[i] as [number, number]);
  }
  if (!pts.length) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

function transformCoord(
  c: number[],
  center: [number, number],
  cosA: number,
  sinA: number,
  scaleX: number,
  scaleY: number,
): number[] {
  const dx = (c[0] - center[0]) * scaleX;
  const dy = (c[1] - center[1]) * scaleY;
  return [center[0] + dx * cosA - dy * sinA, center[1] + dx * sinA + dy * cosA];
}

function transformRing(ring: number[][], center: [number, number], cosA: number, sinA: number, sx: number, sy: number) {
  const nr = ring.map(c => transformCoord(c, center, cosA, sinA, sx, sy));
  if (nr.length > 1) {
    const first = nr[0];
    const last = nr[nr.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      nr[nr.length - 1] = [...first];
    }
  }
  return nr;
}

export function rotateFeatureAroundCenter(
  feature: GeoJSON.Feature,
  center: [number, number],
  angleRad: number,
): GeoJSON.Feature {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return f;
  if (g.type === 'Point') {
    g.coordinates = transformCoord(g.coordinates, center, cosA, sinA, 1, 1);
    return f;
  }
  if (g.type === 'LineString') {
    g.coordinates = g.coordinates.map((c: number[]) => transformCoord(c, center, cosA, sinA, 1, 1));
    return f;
  }
  if (g.type === 'Polygon') {
    g.coordinates = g.coordinates.map((ring: number[][]) => transformRing(ring, center, cosA, sinA, 1, 1));
    return f;
  }
  if (g.type === 'MultiPolygon') {
    g.coordinates = g.coordinates.map((poly: number[][][]) =>
      poly.map((ring: number[][]) => transformRing(ring, center, cosA, sinA, 1, 1)),
    );
    return f;
  }
  return f;
}

export function scaleFeatureAroundCenter(
  feature: GeoJSON.Feature,
  center: [number, number],
  scaleX: number,
  scaleY: number,
): GeoJSON.Feature {
  const f = cloneDeep(feature);
  const g = f.geometry;
  if (!g) return f;
  if (g.type === 'Point') {
    g.coordinates = transformCoord(g.coordinates, center, 1, 0, scaleX, scaleY);
    return f;
  }
  if (g.type === 'LineString') {
    g.coordinates = g.coordinates.map((c: number[]) => transformCoord(c, center, 1, 0, scaleX, scaleY));
    return f;
  }
  if (g.type === 'Polygon') {
    g.coordinates = g.coordinates.map((ring: number[][]) => transformRing(ring, center, 1, 0, scaleX, scaleY));
    return f;
  }
  if (g.type === 'MultiPolygon') {
    g.coordinates = g.coordinates.map((poly: number[][][]) =>
      poly.map((ring: number[][]) => transformRing(ring, center, 1, 0, scaleX, scaleY)),
    );
    return f;
  }
  return f;
}

export function featureAxisAlignedBBox(
  geometry: GeoJSON.Geometry | null | undefined,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  if (!geometry) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const add = (lng: number, lat: number) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  };
  if (geometry.type === 'Point') {
    add(geometry.coordinates[0], geometry.coordinates[1]);
  } else if (geometry.type === 'LineString') {
    geometry.coordinates.forEach(c => add(c[0], c[1]));
  } else if (geometry.type === 'Polygon') {
    geometry.coordinates.forEach(ring => ring.forEach(c => add(c[0], c[1])));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(c => add(c[0], c[1]))));
  }
  if (!Number.isFinite(minLng)) return null;
  return { minLng, minLat, maxLng, maxLat };
}

export type TransformHandleRole = 'rotate' | 'scale-ne' | 'scale-nw' | 'scale-se' | 'scale-sw';

export function buildAoiTransformHandlesGeoJson(
  feature: GeoJSON.Feature | null | undefined,
): GeoJSON.FeatureCollection | null {
  const geom = feature?.geometry;
  const box = featureAxisAlignedBBox(geom ?? null);
  if (!box) return null;
  const { minLng, minLat, maxLng, maxLat } = box;
  const midLng = (minLng + maxLng) / 2;
  const midLat = (minLat + maxLat) / 2;
  const latSpan = Math.max(1e-8, maxLat - minLat);
  const rotateLat = maxLat + latSpan * 0.12;
  const features: GeoJSON.Feature[] = [
    {
      type: 'Feature',
      properties: { role: 'rotate' },
      geometry: { type: 'Point', coordinates: [midLng, rotateLat] },
    },
    {
      type: 'Feature',
      properties: { role: 'scale-ne' },
      geometry: { type: 'Point', coordinates: [maxLng, maxLat] },
    },
    {
      type: 'Feature',
      properties: { role: 'scale-nw' },
      geometry: { type: 'Point', coordinates: [minLng, maxLat] },
    },
    {
      type: 'Feature',
      properties: { role: 'scale-se' },
      geometry: { type: 'Point', coordinates: [maxLng, minLat] },
    },
    {
      type: 'Feature',
      properties: { role: 'scale-sw' },
      geometry: { type: 'Point', coordinates: [minLng, minLat] },
    },
  ];
  return { type: 'FeatureCollection', features };
}

export function findNearestTransformHandle(
  map: MapboxMap,
  collection: GeoJSON.FeatureCollection,
  lng: number,
  lat: number,
  pxThreshold: number,
): { role: TransformHandleRole; coord: [number, number] } | null {
  const click: [number, number] = [lng, lat];
  let best: { role: TransformHandleRole; coord: [number, number]; d: number } | null = null;
  for (const f of collection.features) {
    const role = f.properties?.role as TransformHandleRole | undefined;
    if (!role || f.geometry?.type !== 'Point') continue;
    const coord = f.geometry.coordinates as [number, number];
    const d = lngLatPixelDistance(map, click, coord);
    if (d <= pxThreshold && (!best || d < best.d)) {
      best = { role, coord, d };
    }
  }
  return best;
}

/** Hit-test for AOI edit pointer down (returns true if interaction started). */
export function tryStartAoiEditDrag(args: {
  map: MapboxMap;
  subTool: AoiGeometryEditSubTool;
  feature: GeoJSON.Feature;
  lng: number;
  lat: number;
  hitPx: number;
  showAllVertices: boolean;
  onStart: (drag: AoiEditDragState, snapshot: GeoJSON.Feature) => void;
  onMutate: (feature: GeoJSON.Feature) => void;
}): boolean {
  const { map, subTool, feature, lng, lat, hitPx, showAllVertices, onStart, onMutate } = args;
  const geom = feature.geometry;
  const snapshot = cloneDeep(feature);

  if (subTool === 'addVertex') {
    const edge = findNearestEdgeSegment(map, geom, lng, lat, hitPx);
    if (edge) {
      const next = insertVertexOnEdge(feature, edge.ref, edge.coord[0], edge.coord[1]);
      onMutate(next);
      return true;
    }
    return false;
  }

  if (subTool === 'removeVertex') {
    const hit = findNearestVertex(map, geom, lng, lat, hitPx);
    if (hit) {
      const next = removeVertexFromFeature(feature, hit.ref);
      if (next) {
        onMutate(next);
        return true;
      }
    }
    return false;
  }

  if (subTool === 'rotate') {
    const handles = buildAoiTransformHandlesGeoJson(feature);
    if (handles) {
      const th = findNearestTransformHandle(map, handles, lng, lat, hitPx * 1.1);
      if (th?.role === 'rotate') {
        const center = geometryCentroid(geom) ?? th.coord;
        const startAngleRad = Math.atan2(lat - center[1], lng - center[0]);
        onStart({ mode: 'rotate', center, startAngleRad, baseFeature: snapshot }, snapshot);
        return true;
      }
    }
    const center = geometryCentroid(geom);
    if (center) {
      const startAngleRad = Math.atan2(lat - center[1], lng - center[0]);
      onStart({ mode: 'rotate', center, startAngleRad, baseFeature: snapshot }, snapshot);
      return true;
    }
    return false;
  }

  if (subTool === 'scale') {
    const handles = buildAoiTransformHandlesGeoJson(feature);
    if (handles) {
      const th = findNearestTransformHandle(map, handles, lng, lat, hitPx * 1.1);
      if (th?.role.startsWith('scale-')) {
        const center = geometryCentroid(geom) ?? th.coord;
        const startDist = Math.max(1e-12, Math.hypot(lng - center[0], lat - center[1]));
        onStart({ mode: 'scale', center, startDist, baseFeature: snapshot }, snapshot);
        return true;
      }
    }
    return false;
  }

  const verts =
    subTool === 'reshape' || subTool === 'vertex'
      ? showAllVertices
        ? collectVertexRefs(geom)
        : collectSparseVertexRefs(geom)
      : collectVertexRefs(geom);
  const hit =
    findNearestVertexAmong(map, verts, lng, lat, hitPx) ?? findNearestVertex(map, geom, lng, lat, hitPx);
  if (hit && (subTool === 'vertex' || subTool === 'reshape')) {
    onStart({ mode: 'vertex', ref: hit.ref }, snapshot);
    return true;
  }
  return false;
}

export function applyAoiEditDragMove(
  drag: AoiEditDragState,
  lng: number,
  lat: number,
  baseFeature: GeoJSON.Feature | null,
): GeoJSON.Feature | null {
  if (!baseFeature) return null;
  if (drag.mode === 'vertex') {
    return setVertexCoord(baseFeature, drag.ref, lng, lat);
  }
  if (drag.mode === 'pan') {
    const dLng = lng - drag.last[0];
    const dLat = lat - drag.last[1];
    return translateFeatureCoordinates(baseFeature, dLng, dLat);
  }
  if (drag.mode === 'rotate') {
    const ang = Math.atan2(lat - drag.center[1], lng - drag.center[0]);
    const delta = ang - drag.startAngleRad;
    return rotateFeatureAroundCenter(drag.baseFeature, drag.center, delta);
  }
  if (drag.mode === 'scale') {
    const dist = Math.max(1e-12, Math.hypot(lng - drag.center[0], lat - drag.center[1]));
    const factor = Math.max(0.05, Math.min(25, dist / drag.startDist));
    return scaleFeatureAroundCenter(drag.baseFeature, drag.center, factor, factor);
  }
  return null;
}
