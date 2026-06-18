import type { Feature } from 'geojson';
import { polygonGeometryCentroid } from '../components/fields/fieldsStore';

/** Centroid [lng, lat] from first polygon/point in AOI feature list. */
export function siMapWeatherCentroidFromFeatures(
  features: ReadonlyArray<Feature>,
): { lng: number; lat: number } | null {
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Point') {
      const c = g.coordinates;
      if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
        return { lng: c[0], lat: c[1] };
      }
    }
    if (g.type === 'Polygon') {
      const c = polygonGeometryCentroid(g);
      if (c) return { lng: c[0], lat: c[1] };
    }
    if (g.type === 'MultiPolygon') {
      const c = polygonGeometryCentroid({ type: 'Polygon', coordinates: g.coordinates[0] ?? [] });
      if (c) return { lng: c[0], lat: c[1] };
    }
  }
  return null;
}
