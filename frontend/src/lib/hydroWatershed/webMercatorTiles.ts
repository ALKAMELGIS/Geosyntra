/**
 * Minimal Web Mercator (EPSG:3857) slippy-tile math used by the Hydro Watershed
 * workflow to fetch and georeference DEM tiles. All longitudes/latitudes are in
 * degrees; tile coordinates are the standard XYZ scheme.
 */

export const TILE_SIZE = 256

export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z)
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z)
  )
}

export function tileXToLng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z)
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Approximate metres-per-degree at a given latitude (WGS84-ish). */
export function metersPerDegreeLng(lat: number): number {
  return 111320 * Math.cos((lat * Math.PI) / 180)
}

export const METERS_PER_DEGREE_LAT = 110540
