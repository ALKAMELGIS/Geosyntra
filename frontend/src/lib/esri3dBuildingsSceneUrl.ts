/** Esri Living Atlas global 3D buildings (I3S SceneServer, layer 0). */
export const ESRI_3D_BUILDINGS_SCENE_SERVER =
  'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer'

export const ESRI_3D_BUILDINGS_SCENE_LAYER_URL = `${ESRI_3D_BUILDINGS_SCENE_SERVER}/layers/0`

/** OpenStreetMap global 3D buildings (I3S SceneServer, layer 0). */
export const OSM_3D_BUILDINGS_SCENE_SERVER =
  'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer'

export const OSM_3D_BUILDINGS_SCENE_LAYER_URL = `${OSM_3D_BUILDINGS_SCENE_SERVER}/layers/0`

export type Esri3dBuildingsSceneVariant = 'esri' | 'osm'

export function resolveEsri3dBuildingsSceneLayerUrl(
  variant: Esri3dBuildingsSceneVariant = 'esri',
): string {
  return variant === 'osm' ? OSM_3D_BUILDINGS_SCENE_LAYER_URL : ESRI_3D_BUILDINGS_SCENE_LAYER_URL
}
