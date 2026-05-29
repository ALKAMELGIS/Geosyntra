import L from 'leaflet';
import { geometryAoiAreaSqMeters } from './siAoiZonalStats';

type FieldLikeGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

type LeafletGeometryUtil = {
  geodesicArea: (latlngs: L.LatLng[]) => number;
};

function getGeometryUtil(): LeafletGeometryUtil | null {
  const util = (L as unknown as { GeometryUtil?: LeafletGeometryUtil }).GeometryUtil;
  return util && typeof util.geodesicArea === 'function' ? util : null;
}

function ringToLatLngs(ring: GeoJSON.Position[]): L.LatLng[] {
  return ring.map(([lng, lat]) => L.latLng(lat, lng));
}

/** Geodesic AOI area in hectares — isolated from fieldsStore to avoid chunk init cycles. */
export function geodesicAreaHectares(geometry: FieldLikeGeometry): number {
  let m2 = 0;
  const util = getGeometryUtil();
  if (util) {
    try {
      if (geometry.type === 'Polygon') {
        const outer = geometry.coordinates[0];
        if (outer && outer.length >= 3) m2 = util.geodesicArea(ringToLatLngs(outer));
      } else if (geometry.type === 'MultiPolygon') {
        for (const poly of geometry.coordinates) {
          const outer = poly[0];
          if (outer && outer.length >= 3) m2 += util.geodesicArea(ringToLatLngs(outer));
        }
      }
    } catch {
      m2 = 0;
    }
  }
  if (m2 <= 0) {
    m2 = geometryAoiAreaSqMeters(geometry);
  }
  return Math.max(0, m2 / 10_000);
}
