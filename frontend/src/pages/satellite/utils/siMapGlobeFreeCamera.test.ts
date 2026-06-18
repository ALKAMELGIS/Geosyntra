import { describe, expect, it, vi } from 'vitest';
import {
  applySiMapGlobeLiveTerrainFromPitch,
  primeSiMapGlobeEarth3DViewEntry,
  siMapGlobeLiveTerrainShouldBeEnabled,
  siMapGlobeTerrainExaggerationForPitch,
  siMapView3dOrbitModeActive,
} from './siMapGlobeFreeCamera';
import { SI_DEFAULT_TERRAIN_SETTINGS } from './siMapProjectionTerrain';

describe('siMapView3dOrbitModeActive', () => {
  it('uses custom RMB orbit on globe projection and when pitched or docked', () => {
    expect(siMapView3dOrbitModeActive(false, 0, { globeProjection: true })).toBe(true);
    expect(siMapView3dOrbitModeActive(true, 0)).toBe(true);
    expect(siMapView3dOrbitModeActive(false, 5)).toBe(true);
    expect(siMapView3dOrbitModeActive(false, 0, { globeProjection: false })).toBe(false);
  });
});

describe('applySiMapGlobeLiveTerrainFromPitch', () => {
  it('sets terrain exaggeration when pitch is above threshold', () => {
    const setTerrain = vi.fn();
    const map = {
      isStyleLoaded: () => true,
      getSource: () => ({}),
      getTerrain: () => null,
      setTerrain,
      setProjection: vi.fn(),
      getProjection: () => ({ name: 'globe' }),
      getStyle: () => ({ sources: { composite: {} }, layers: [] }),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    const ok = applySiMapGlobeLiveTerrainFromPitch(map, 45, {
      ...SI_DEFAULT_TERRAIN_SETTINGS,
      buildings: true,
    });

    expect(ok).toBe(true);
    expect(setTerrain).toHaveBeenCalled();
    const exag = setTerrain.mock.calls.at(-1)?.[0]?.exaggeration;
    expect(exag).toBeGreaterThan(0);
  });

  it('siMapGlobeLiveTerrainShouldBeEnabled respects dock and pitch', () => {
    expect(siMapGlobeLiveTerrainShouldBeEnabled(0, false)).toBe(false);
    expect(siMapGlobeLiveTerrainShouldBeEnabled(30, false)).toBe(true);
    expect(siMapGlobeLiveTerrainShouldBeEnabled(0, true)).toBe(true);
  });
});

describe('primeSiMapGlobeEarth3DViewEntry', () => {
  it('pre-warms DEM and overlay layers without applying pitched terrain or sky', () => {
    const setTerrain = vi.fn();
    const setFog = vi.fn();
    const addLayer = vi.fn();
    const map = {
      isStyleLoaded: () => true,
      getCenter: () => ({ lng: 46.7, lat: 24.7 }),
      getSource: () => ({}),
      isSourceLoaded: () => true,
      areTilesLoaded: () => true,
      getTerrain: () => null,
      setTerrain,
      setProjection: vi.fn(),
      getProjection: () => ({ name: 'globe' }),
      getStyle: () => ({ sources: { composite: {} }, layers: [] }),
      addSource: vi.fn(),
      addLayer,
      getLayer: vi.fn(),
      setFog,
      getFog: () => null,
      triggerRepaint: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    primeSiMapGlobeEarth3DViewEntry(map, { ...SI_DEFAULT_TERRAIN_SETTINGS, buildings: true });

    expect(addLayer).toHaveBeenCalled();
    expect(setFog).not.toHaveBeenCalled();
    const terrainCalls = setTerrain.mock.calls.filter(call => call[0] != null);
    expect(terrainCalls.length).toBe(0);
  });
});