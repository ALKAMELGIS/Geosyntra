/** Compute [minX, minY, maxX, maxY] WGS84 bounds for GeoJSON FeatureCollection / Feature / geometry. */
export function getGeoJsonBounds(geojson: unknown): [number, number, number, number] | null {
  if (!geojson || typeof geojson !== 'object') return null;
  const g = geojson as Record<string, unknown>;
  const points: [number, number][] = [];

  const walkCoords = (coords: unknown) => {
    if (!coords) return;
    if (typeof (coords as number[])[0] === 'number' && typeof (coords as number[])[1] === 'number') {
      points.push([(coords as number[])[0], (coords as number[])[1]]);
      return;
    }
    if (Array.isArray(coords)) {
      coords.forEach(walkCoords);
    }
  };

  if (g.type === 'FeatureCollection') {
    const feats = g.features as Array<{ geometry?: { coordinates?: unknown } }> | undefined;
    feats?.forEach(f => walkCoords(f.geometry?.coordinates));
  } else if (g.type === 'Feature') {
    walkCoords((g.geometry as { coordinates?: unknown } | undefined)?.coordinates);
  } else if (g.type === 'GeometryCollection') {
    const geoms = g.geometries as Array<{ coordinates?: unknown }> | undefined;
    geoms?.forEach(geom => walkCoords(geom.coordinates));
  } else if (g.coordinates) {
    walkCoords(g.coordinates);
  }

  if (points.length === 0) return null;

  let [minX, minY] = points[0];
  let [maxX, maxY] = points[0];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** First [lng, lat] vertex of a geometry — a cheap per-feature representative point. */
function firstCoord(coords: unknown): [number, number] | null {
  if (!coords) return null;
  const arr = coords as number[];
  if (typeof arr[0] === 'number' && typeof arr[1] === 'number') return [arr[0], arr[1]];
  if (Array.isArray(coords)) {
    for (const c of coords) {
      const p = firstCoord(c);
      if (p) return p;
    }
  }
  return null;
}

/** One representative point per feature (avoids weighting a fit by polygon vertex count). */
function featureRepresentativePoints(geojson: unknown): [number, number][] {
  const g = geojson as Record<string, unknown> | null;
  if (!g || typeof g !== 'object') return [];
  const pts: [number, number][] = [];
  if (g.type === 'FeatureCollection') {
    const feats = g.features as Array<{ geometry?: { coordinates?: unknown } }> | undefined;
    feats?.forEach(f => {
      const p = firstCoord(f.geometry?.coordinates);
      if (p) pts.push(p);
    });
  } else if (g.type === 'Feature') {
    const p = firstCoord((g.geometry as { coordinates?: unknown } | undefined)?.coordinates);
    if (p) pts.push(p);
  } else if (g.coordinates) {
    const p = firstCoord(g.coordinates);
    if (p) pts.push(p);
  }
  return pts;
}

/**
 * Tight bounds of the densest local cluster of features.
 *
 * ArcGIS feature services often hold thousands of small features spread across several
 * regions (e.g. multi-country assets). Fitting the *full* extent then zooms out so far that
 * the small polygons become sub-pixel and the layer looks "added but missing on the map".
 * This grids the per-feature representative points and returns the bounds of the busiest
 * cell (plus its immediate neighbours), so an auto-fit lands where most features actually are
 * at a zoom where they are visible. Returns null for compact layers — the caller should then
 * fit the full bounds as usual.
 */
export function getGeoJsonPrimaryClusterBounds(
  geojson: unknown,
  opts?: { cellDeg?: number; minFeatures?: number; minSpanDeg?: number },
): [number, number, number, number] | null {
  const cellDeg = opts?.cellDeg ?? 0.5;
  const minFeatures = opts?.minFeatures ?? 24;
  const minSpanDeg = opts?.minSpanDeg ?? 3;

  const pts = featureRepresentativePoints(geojson);
  if (pts.length < minFeatures) return null;

  let minX = pts[0][0];
  let minY = pts[0][1];
  let maxX = pts[0][0];
  let maxY = pts[0][1];
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  // Already compact — let the caller fit the full bounds.
  if (maxX - minX < minSpanDeg && maxY - minY < minSpanDeg) return null;

  const counts = new Map<string, number>();
  let bestKey = '';
  let bestCount = 0;
  for (const [x, y] of pts) {
    const cx = Math.floor(x / cellDeg);
    const cy = Math.floor(y / cellDeg);
    const k = `${cx}|${cy}`;
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    if (n > bestCount) {
      bestCount = n;
      bestKey = k;
    }
  }
  if (!bestKey) return null;

  const [bcx, bcy] = bestKey.split('|').map(Number);
  let cx0 = Infinity;
  let cy0 = Infinity;
  let cx1 = -Infinity;
  let cy1 = -Infinity;
  let inCount = 0;
  for (const [x, y] of pts) {
    const cx = Math.floor(x / cellDeg);
    const cy = Math.floor(y / cellDeg);
    if (Math.abs(cx - bcx) <= 1 && Math.abs(cy - bcy) <= 1) {
      if (x < cx0) cx0 = x;
      if (y < cy0) cy0 = y;
      if (x > cx1) cx1 = x;
      if (y > cy1) cy1 = y;
      inCount += 1;
    }
  }
  if (!inCount || !Number.isFinite(cx0)) return null;
  return [cx0, cy0, cx1, cy1];
}
