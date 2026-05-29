/**
 * Leaflet-only field geometry helpers — kept out of `fieldsStore.ts` so
 * Satellite Intelligence does not pull `leaflet` into its lazy chunk.
 */
import L from 'leaflet'
import { geodesicAreaHectares } from '../../utils/siFieldGeodesicArea'
import type { SavedField } from './fieldsStore'

/**
 * Convert any leaflet-draw layer (polygon / rectangle / circle) into a
 * GeoJSON polygon suitable for `SavedField.geometry`.
 */
export function leafletLayerToPolygon(
  layer: L.Layer,
): { geometry: SavedField['geometry']; areaHectares: number } | null {
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng()
    const radius = layer.getRadius()
    const segments = 64
    const earth = 6_378_137
    const lat = (center.lat * Math.PI) / 180
    const lng = (center.lng * Math.PI) / 180
    const ring: GeoJSON.Position[] = []
    for (let i = 0; i <= segments; i++) {
      const bearing = (i / segments) * 2 * Math.PI
      const angularDist = radius / earth
      const sinLat = Math.sin(lat) * Math.cos(angularDist) + Math.cos(lat) * Math.sin(angularDist) * Math.cos(bearing)
      const newLat = Math.asin(sinLat)
      const newLng =
        lng +
        Math.atan2(
          Math.sin(bearing) * Math.sin(angularDist) * Math.cos(lat),
          Math.cos(angularDist) - Math.sin(lat) * Math.sin(newLat),
        )
      ring.push([(newLng * 180) / Math.PI, (newLat * 180) / Math.PI])
    }
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }
    return { geometry, areaHectares: geodesicAreaHectares(geometry) }
  }

  if (typeof (layer as L.Polygon).toGeoJSON === 'function') {
    try {
      const fc = (layer as L.Polygon).toGeoJSON() as GeoJSON.Feature
      if (fc.geometry?.type === 'Polygon' || fc.geometry?.type === 'MultiPolygon') {
        const geom = fc.geometry as SavedField['geometry']
        return { geometry: geom, areaHectares: geodesicAreaHectares(geom) }
      }
    } catch {
      /* fallthrough */
    }
  }
  return null
}

/** Compute a Leaflet `LatLngBounds` for any saved field — used by Zoom-to-Field. */
export function geometryBounds(geometry: SavedField['geometry']): L.LatLngBounds | null {
  try {
    const fc: GeoJSON.Feature = { type: 'Feature', geometry, properties: {} }
    const layer = L.geoJSON(fc)
    const b = layer.getBounds()
    return b.isValid() ? b : null
  } catch {
    return null
  }
}
