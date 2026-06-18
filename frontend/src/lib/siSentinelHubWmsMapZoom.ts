/** Map tile size used for Sentinel Hub WMS GetMap on the Mapbox raster stack. */
export const SI_SENTINEL_HUB_WMS_TILE_SIZE = 512;

/** S2L2A (and most SH WMS collections) — max ~1500 m/px for 512×512 map tiles. */
export const SI_SENTINEL_HUB_WMS_MAX_METERS_PER_PIXEL = 1500;

const EARTH_CIRCUMFERENCE_M = 40075016.686;

/**
 * Minimum Mapbox zoom so WMS 512px tiles stay within Sentinel Hub resolution limits.
 * Below this zoom the API returns error overlay tiles (red warning text) — hide map tiles only.
 */
export function siSentinelHubWmsMinZoomForResolution(
  maxMetersPerPixel = SI_SENTINEL_HUB_WMS_MAX_METERS_PER_PIXEL,
  latitudeDeg = 0,
): number {
  const cosLat = Math.max(0.01, Math.cos((latitudeDeg * Math.PI) / 180));
  const worldM = EARTH_CIRCUMFERENCE_M * cosLat;
  const zoom = Math.log2(worldM / (SI_SENTINEL_HUB_WMS_TILE_SIZE * maxMetersPerPixel));
  return Math.max(0, Math.ceil(zoom - 0.05));
}

/** Conservative default for global map display (mid-latitudes ≈ zoom 6+). */
export const SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM = siSentinelHubWmsMinZoomForResolution(
  SI_SENTINEL_HUB_WMS_MAX_METERS_PER_PIXEL,
  35,
);
