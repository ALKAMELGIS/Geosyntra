import { describe, expect, it, vi } from 'vitest';
import {
  SI_TERRAIN_MESH_PITCH_OFF,
  SI_TERRAIN_MESH_PITCH_ON,
  applySiMapTerrainMeshExaggeration,
  flushSiMapTerrainPendingExaggeration,
  resetSiMapTerrainStabilityForTests,
  resolveSiMapLayerExtrusion3dActive,
  siMapTerrainMeshShouldBeLive,
} from './siMapTerrainStability';

describe('siMapTerrainStability', () => {
  it('layer extrusion 3d hysteresis matches terrain mesh thresholds', () => {
    expect(resolveSiMapLayerExtrusion3dActive(false, 1, false)).toBe(false);
    expect(resolveSiMapLayerExtrusion3dActive(false, SI_TERRAIN_MESH_PITCH_ON, false)).toBe(true);
    expect(resolveSiMapLayerExtrusion3dActive(false, 1.5, true)).toBe(true);
    expect(resolveSiMapLayerExtrusion3dActive(false, 0.5, true)).toBe(false);
    expect(resolveSiMapLayerExtrusion3dActive(true, 0, false)).toBe(true);
  });

  it('terrain mesh hysteresis prevents flicker near threshold', () => {
    const map = {} as import('mapbox-gl').Map;
    expect(siMapTerrainMeshShouldBeLive(map, 1)).toBe(false);
    expect(siMapTerrainMeshShouldBeLive(map, SI_TERRAIN_MESH_PITCH_ON)).toBe(true);
    expect(siMapTerrainMeshShouldBeLive(map, 1.5)).toBe(true);
    expect(siMapTerrainMeshShouldBeLive(map, 0.5)).toBe(false);
    expect(siMapTerrainMeshShouldBeLive(map, 3)).toBe(true);
  });

  it('defers terrain mesh until DEM source is mounted', () => {
    const setTerrain = vi.fn();
    const map = {
      getSource: () => null,
      isSourceLoaded: () => false,
      areTilesLoaded: () => false,
      getZoom: () => 12,
      getPitch: () => 45,
      getTerrain: () => null,
      setTerrain,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    resetSiMapTerrainStabilityForTests(map);
    const applied = applySiMapTerrainMeshExaggeration(map, 1.2, { force: true });
    expect(applied).toBe(false);
    expect(setTerrain).not.toHaveBeenCalled();

    (map as unknown as { getSource: () => object }).getSource = () => ({});
    (map as unknown as { isSourceLoaded: () => boolean }).isSourceLoaded = () => false;
    const flushed = flushSiMapTerrainPendingExaggeration(map);
    expect(flushed).toBe(true);
    expect(setTerrain).toHaveBeenCalled();
    const streamingExag = setTerrain.mock.calls[0]?.[0]?.exaggeration;
    expect(streamingExag).toBeGreaterThan(0.2);
    expect(streamingExag).toBeLessThanOrEqual(1.2);
  });

  it('boots terrain mesh progressively while viewport tiles stream', () => {
    const setTerrain = vi.fn();
    const map = {
      getSource: () => ({}),
      isSourceLoaded: () => true,
      areTilesLoaded: () => false,
      getZoom: () => 12,
      getTerrain: () => null,
      setTerrain,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    resetSiMapTerrainStabilityForTests(map);
    const applied = applySiMapTerrainMeshExaggeration(map, 1.2, { force: true });
    expect(applied).toBe(true);
    expect(setTerrain).toHaveBeenCalled();
    const streamingExag = setTerrain.mock.calls[0]?.[0]?.exaggeration;
    expect(streamingExag).toBeGreaterThan(0.2);
    expect(streamingExag).toBeLessThanOrEqual(1.2);

    (map as { areTilesLoaded: () => boolean }).areTilesLoaded = () => true;
    const flushed = flushSiMapTerrainPendingExaggeration(map);
    expect(flushed).toBe(true);
    expect(setTerrain).toHaveBeenLastCalledWith(
      expect.objectContaining({ exaggeration: 1.2 }),
    );
  });

  it('keeps terrain mesh during tile reload instead of clearing it', () => {
    const setTerrain = vi.fn();
    const liveMesh = { source: 'si-global-terrain-dem', exaggeration: 0.58 };
    const map = {
      getSource: () => ({}),
      isSourceLoaded: () => true,
      areTilesLoaded: () => false,
      getZoom: () => 12,
      getTerrain: () => liveMesh,
      setTerrain,
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    resetSiMapTerrainStabilityForTests(map);
    applySiMapTerrainMeshExaggeration(map, 1.2, { force: true });
    expect(setTerrain).not.toHaveBeenCalledWith(null);
    expect(setTerrain).toHaveBeenCalled();
  });
});
