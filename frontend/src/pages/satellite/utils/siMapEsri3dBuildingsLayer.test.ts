import { describe, expect, it, vi } from 'vitest';
import { syncSiMapEsri3dBuildingsLayer } from './siMapEsri3dBuildingsLayer';

const osm3dEntry = {
  id: 'osm-3d-buildings',
  label: '3D ED Building',
  mapboxStyle: {},
  esri3dBuildings: true as const,
  esri3dBuildingsScene: 'osm' as const,
};

function mockMap(styleReady: boolean) {
  return {
    isStyleLoaded: () => styleReady,
    addControl: vi.fn(),
    removeControl: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getLayer: vi.fn(),
    getStyle: vi.fn(() => ({ sources: {}, layers: [] })),
  };
}

describe('syncSiMapEsri3dBuildingsLayer', () => {
  it('skips attach while Mapbox style is loading (does not throw)', () => {
    const map = mockMap(false);
    expect(() => syncSiMapEsri3dBuildingsLayer(map as never, osm3dEntry)).not.toThrow();
    expect(map.addControl).not.toHaveBeenCalled();
  });

  it('mounts MapboxOverlay when style is ready', () => {
    const map = mockMap(true);
    syncSiMapEsri3dBuildingsLayer(map as never, osm3dEntry);
    expect(map.addControl).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild the tileset on every move frame', () => {
    const map = mockMap(true);
    syncSiMapEsri3dBuildingsLayer(map as never, osm3dEntry);
    const moveBindings = map.on.mock.calls.filter(([event]) => event === 'move');
    expect(moveBindings).toHaveLength(0);
  });
});
