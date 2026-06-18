import { describe, expect, it } from 'vitest';
import {
  ESRI_3D_BUILDINGS_SCENE_LAYER_URL,
  ESRI_3D_BUILDINGS_SCENE_SERVER,
  OSM_3D_BUILDINGS_SCENE_LAYER_URL,
  OSM_3D_BUILDINGS_SCENE_SERVER,
  resolveEsri3dBuildingsSceneLayerUrl,
} from '../../../lib/esri3dBuildingsSceneUrl';
import { isEsri3dBuildingsBasemapEntry, resolveEsri3dBuildingsSceneVariant } from '../basemapCatalog';

describe('esri3dBuildingsSceneUrl', () => {
  it('points at Esri3D_Buildings_v1 layer 0', () => {
    expect(ESRI_3D_BUILDINGS_SCENE_SERVER).toBe(
      'https://basemaps3d.arcgis.com/arcgis/rest/services/Esri3D_Buildings_v1/SceneServer',
    );
    expect(ESRI_3D_BUILDINGS_SCENE_LAYER_URL).toBe(`${ESRI_3D_BUILDINGS_SCENE_SERVER}/layers/0`);
    expect(resolveEsri3dBuildingsSceneLayerUrl('esri')).toBe(ESRI_3D_BUILDINGS_SCENE_LAYER_URL);
  });

  it('points at OpenStreetMap3D_Buildings_v1 layer 0', () => {
    expect(OSM_3D_BUILDINGS_SCENE_SERVER).toBe(
      'https://basemaps3d.arcgis.com/arcgis/rest/services/OpenStreetMap3D_Buildings_v1/SceneServer',
    );
    expect(OSM_3D_BUILDINGS_SCENE_LAYER_URL).toBe(`${OSM_3D_BUILDINGS_SCENE_SERVER}/layers/0`);
    expect(resolveEsri3dBuildingsSceneLayerUrl('osm')).toBe(OSM_3D_BUILDINGS_SCENE_LAYER_URL);
  });
});

describe('isEsri3dBuildingsBasemapEntry', () => {
  it('detects Esri 3D Buildings catalog entries', () => {
    expect(isEsri3dBuildingsBasemapEntry({ id: 'x', label: 'x', mapboxStyle: {}, esri3dBuildings: true })).toBe(
      true,
    );
    expect(isEsri3dBuildingsBasemapEntry({ id: 'x', label: 'x', mapboxStyle: {} })).toBe(false);
  });
});

describe('resolveEsri3dBuildingsSceneVariant', () => {
  it('defaults to esri and resolves osm variant', () => {
    expect(resolveEsri3dBuildingsSceneVariant({ id: 'x', label: 'x', mapboxStyle: {}, esri3dBuildings: true })).toBe(
      'esri',
    );
    expect(
      resolveEsri3dBuildingsSceneVariant({
        id: 'osm-3d-buildings',
        label: 'OpenStreetMap 3D Buildings',
        mapboxStyle: {},
        esri3dBuildings: true,
        esri3dBuildingsScene: 'osm',
      }),
    ).toBe('osm');
  });
});
