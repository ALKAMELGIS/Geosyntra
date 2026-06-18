import type { LaPoint } from './siLocationAllocationTypes';

type PickableLayer = {
  id: string;
  name: string;
  visible?: boolean;
  geojson?: GeoJSON.FeatureCollection | null;
};

const EARTH_R = 6371000;

function haversineMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function pointFromGeometry(
  geom: GeoJSON.Geometry | null | undefined,
): { lng: number; lat: number } | null {
  if (!geom) return null;
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
    return null;
  }
  if (geom.type === 'MultiPoint' && geom.coordinates[0]) {
    const [lng, lat] = geom.coordinates[0];
    if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat };
  }
  if (geom.type === 'Polygon' && geom.coordinates[0]?.[0]) {
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
  return null;
}

/** Nearest visible point feature from custom map layers within tolerance (m). */
export function pickLaPointFromMapLayers(
  lng: number,
  lat: number,
  layers: PickableLayer[],
  opts?: { toleranceM?: number; prefix?: string },
): LaPoint | null {
  const toleranceM = opts?.toleranceM ?? 120;
  const prefix = opts?.prefix ?? 'layer';
  let best: { lng: number; lat: number; dist: number; label: string; id: string } | null = null;

  for (const layer of layers) {
    if (layer.visible === false || !layer.geojson?.features?.length) continue;
    for (const feature of layer.geojson.features) {
      const pt = pointFromGeometry(feature.geometry);
      if (!pt) continue;
      const dist = haversineMeters(lng, lat, pt.lng, pt.lat);
      if (dist > toleranceM) continue;
      const label =
        String(
          feature.properties?.name ??
            feature.properties?.label ??
            feature.properties?.title ??
            layer.name ??
            'Feature',
        ).trim() || layer.name;
      if (!best || dist < best.dist) {
        best = { ...pt, dist, label, id: `${prefix}-${layer.id}-${label}` };
      }
    }
  }

  if (!best) return null;
  return {
    id: best.id,
    lng: best.lng,
    lat: best.lat,
    label: best.label,
  };
}

export function appendLaPointLine(text: string, lat: number, lng: number): string {
  const line = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return text.trim() ? `${text.trim()}\n${line}` : line;
}

export function appendLaPoint(text: string, point: LaPoint): string {
  const line = point.label
    ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}  ; ${point.label}`
    : `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return text.trim() ? `${text.trim()}\n${line}` : line;
}
