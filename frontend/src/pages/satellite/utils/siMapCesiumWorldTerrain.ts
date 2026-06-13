/**
 * Mapbox `raster-dem` equivalent of Cesium world terrain bootstrap:
 *
 * ```js
 * const terrainProvider = await Cesium.createWorldTerrainAsync();
 * viewer.terrainProvider = terrainProvider;
 * ```
 *
 * Mapbox GL cannot assign a Cesium `TerrainProvider` — it uses Terrarium PNG tiles
 * for `map.setTerrain()`. These global elevation tiles are the standard open world
 * DEM used with Mapbox 3D mesh (same role as Cesium World Terrain in a globe view).
 *
 * @see https://cesium.com/learn/cesiumjs/ref-doc/Cesium.html#createWorldTerrainAsync
 */
export const SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Primary Terrarium DEM tile set for `si-global-terrain-dem`. */
export const SI_CESIUM_WORLD_TERRAIN_DEM_TILES = [
  SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE,
] as const;

export const SI_CESIUM_WORLD_TERRAIN_DEM_MAX_ZOOM = 15;

export function resolveCesiumWorldTerrainDemTileUrl(z: number, x: number, y: number): string {
  return SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** True when the mounted DEM source already points at Cesium world Terrarium tiles. */
export function isSiCesiumWorldTerrainDemTemplate(tileTemplate: string | null | undefined): boolean {
  return tileTemplate === SI_CESIUM_WORLD_TERRAIN_DEM_TILE_TEMPLATE;
}
