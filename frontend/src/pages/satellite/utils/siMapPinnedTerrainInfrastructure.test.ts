import { describe, expect, it, vi } from 'vitest';
import {
  buildSiMapPinnedTerrainInfrastructurePanelRows,
  isSiMapPinnedTerrainInfrastructureLayerId,
  pinSiMapTerrainInfrastructureBelowBasemap,
} from './siMapPinnedTerrainInfrastructure';
import {
  SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
  SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
} from './siMapEarthHybridUnderlay';
import { HILLSHADE_LAYER_ID } from './siMapProjectionTerrain';

describe('siMapPinnedTerrainInfrastructure', () => {
  it('recognizes pinned infrastructure layer ids', () => {
    expect(isSiMapPinnedTerrainInfrastructureLayerId(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID)).toBe(true);
    expect(isSiMapPinnedTerrainInfrastructureLayerId(HILLSHADE_LAYER_ID)).toBe(true);
    expect(isSiMapPinnedTerrainInfrastructureLayerId('si-multi-aoi-line')).toBe(false);
  });

  it('pins relief layers below basemap', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({
        layers: [
          { id: SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID },
          { id: SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID },
          { id: HILLSHADE_LAYER_ID },
          { id: 'si-basemap-esri-layer-0' },
          { id: 'si-terrain-contours' },
        ],
      }),
      getLayer: (id: string) =>
        id === SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID ||
        id === SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID ||
        id === HILLSHADE_LAYER_ID ||
        id === 'si-basemap-esri-layer-0'
          ? {}
          : null,
      moveLayer,
    };
    pinSiMapTerrainInfrastructureBelowBasemap(map as never);
    expect(moveLayer).toHaveBeenCalledWith(HILLSHADE_LAYER_ID, 'si-basemap-esri-layer-0');
    expect(moveLayer).toHaveBeenCalledWith(
      SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
      'si-basemap-esri-layer-0',
    );
    expect(moveLayer).toHaveBeenCalledWith(SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID, 'si-basemap-esri-layer-0');
    expect(moveLayer).toHaveBeenCalledWith(
      SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
      HILLSHADE_LAYER_ID,
    );
    expect(moveLayer).toHaveBeenCalledWith(
      SI_EARTH_TERRAIN_UNDERLAY_LAYER_ID,
      SI_ESRI_ELEVATION_HILLSHADE_UNDERLAY_LAYER_ID,
    );
  });

  it('builds read-only dev panel rows', () => {
    const rows = buildSiMapPinnedTerrainInfrastructurePanelRows(null, { elevation3d: true });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every(r => r.pinned && r.devOnly && !r.toggleable && !r.actionable)).toBe(true);
    expect(rows.some(r => r.id === 'sys-terrain-dem-mesh')).toBe(true);
  });
});
