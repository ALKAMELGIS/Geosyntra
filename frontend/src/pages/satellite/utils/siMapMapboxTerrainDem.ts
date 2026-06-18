/**
 * Mapbox Terrain-DEM v1 — native raster-dem for `map.setTerrain` + terrain-v2 contours.
 * @see https://docs.mapbox.com/mapbox-gl-js/example/add-terrain/
 */
import { resolveAbsoluteUrl } from '../../../lib/apiClient';
import {
  getMapboxAccessToken,
  getPlatformMapboxAccessToken,
  isMapboxGlInitPlaceholder,
  shouldProxyMapboxRequests,
} from '../../../lib/mapboxAccessToken';
import { devMapboxProxyRewrite, resolveMapboxProxyUrl } from '../../../lib/mapboxProxyUrl';

export const SI_MAPBOX_TERRAIN_DEM_V1_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';
export const SI_MAPBOX_TERRAIN_DEM_V1_TILE_PATH =
  'https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}.webp';
export const SI_MAPBOX_TERRAIN_DEM_V1_MAX_ZOOM = 14;
export const SI_MAPBOX_TERRAIN_DEM_V1_TILE_SIZE = 512;

export function isSiMapboxTerrainDemV1Template(template: string | null | undefined): boolean {
  if (!template) return false;
  return (
    template.includes('mapbox-terrain-dem-v1') ||
    template.startsWith(SI_MAPBOX_TERRAIN_DEM_V1_URL)
  );
}

export function siMapboxTerrainDemV1IsAvailable(): boolean {
  if (shouldProxyMapboxRequests()) return true;
  const token =
    getPlatformMapboxAccessToken()?.trim() || getMapboxAccessToken()?.trim();
  return Boolean(token && !isMapboxGlInitPlaceholder(token));
}

export function buildSiMapboxTerrainDemV1TileTemplate(): string | null {
  if (shouldProxyMapboxRequests()) {
    return resolveMapboxProxyUrl(SI_MAPBOX_TERRAIN_DEM_V1_TILE_PATH);
  }
  const token =
    getPlatformMapboxAccessToken()?.trim() || getMapboxAccessToken()?.trim();
  if (!token || isMapboxGlInitPlaceholder(token)) return null;
  const upstream = `${SI_MAPBOX_TERRAIN_DEM_V1_TILE_PATH}?access_token=${encodeURIComponent(token)}`;
  const rewritten = devMapboxProxyRewrite(upstream);
  if (rewritten.startsWith('/')) return resolveAbsoluteUrl(rewritten);
  return rewritten;
}

export function resolveSiMapboxTerrainDemV1TileTemplates(): string[] {
  const template = buildSiMapboxTerrainDemV1TileTemplate();
  return template ? [template] : [];
}

function normalizeDemTileTemplate(template: string): string {
  return template
    .replace(/%7Bz%7D/gi, '{z}')
    .replace(/%7Bx%7D/gi, '{x}')
    .replace(/%7By%7D/gi, '{y}');
}

export function resolveSiMapboxTerrainDemV1TileUrl(z: number, x: number, y: number): string {
  const templates = resolveSiMapboxTerrainDemV1TileTemplates();
  const template = normalizeDemTileTemplate(templates[0] ?? SI_MAPBOX_TERRAIN_DEM_V1_TILE_PATH);
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}
