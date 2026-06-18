/** Decode Google encoded polyline (Routes API / Directions). Returns [lng, lat][] WGS84. */
export function decodeGoogleEncodedPolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = []
  if (!encoded?.trim()) return coordinates
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat
    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng
    coordinates.push([lng / 1e5, lat / 1e5])
  }
  return coordinates
}

export function lineStringFeatureCollectionFromLngLat(
  coords: [number, number][],
  properties?: Record<string, unknown>,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: properties ?? {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  }
}
