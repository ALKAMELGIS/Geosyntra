import { describe, expect, it, vi } from 'vitest';
import {
  SI_MAP_GIS_FLY_TO_DURATION_MS,
  SI_MAP_GIS_MORPH_DURATION_MS,
  attachSiMapGisCameraController,
  configureSiMapGisNavigationBaseline,
} from './siMapGisCameraController';

function mockMap() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const dragPan = { enable: vi.fn(), disable: vi.fn() };
  const scrollZoom = { enable: vi.fn(), disable: vi.fn() };
  const dragRotate = { enable: vi.fn(), disable: vi.fn() };
  const doubleClickZoom = { enable: vi.fn(), disable: vi.fn() };
  return {
    dragPan,
    scrollZoom,
    dragRotate,
    doubleClickZoom,
    getZoom: () => 10,
    getMaxZoom: () => 20,
    getPitch: () => 0,
    getBearing: () => 0,
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(fn);
    }),
    emit(event: string, payload?: unknown) {
      for (const fn of handlers.get(event) ?? []) fn(payload);
    },
  };
}

describe('siMapGisCameraController', () => {
  it('exports Cesium-equivalent morph and fly durations', () => {
    expect(SI_MAP_GIS_MORPH_DURATION_MS).toBe(1500);
    expect(SI_MAP_GIS_FLY_TO_DURATION_MS).toBe(1200);
  });

  it('configures LMB pan, wheel zoom, disables native rotate and dblclick zoom', () => {
    const map = mockMap();
    configureSiMapGisNavigationBaseline(map as never);
    expect(map.dragPan.enable).toHaveBeenCalled();
    expect(map.scrollZoom.enable).toHaveBeenCalled();
    expect(map.dragRotate.disable).toHaveBeenCalled();
    expect(map.doubleClickZoom.disable).toHaveBeenCalled();
  });

  it('double-click flies to lngLat with smooth duration', () => {
    const map = mockMap();
    attachSiMapGisCameraController(map as never, { getIs3d: () => false });
    map.emit('dblclick', {
      preventDefault: vi.fn(),
      lngLat: { lng: 55.3, lat: 25.2 },
    });
    expect(map.flyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [55.3, 25.2],
        duration: SI_MAP_GIS_FLY_TO_DURATION_MS,
        pitch: 0,
      }),
    );
  });

  it('locks pitch to nadir in 2D on move', () => {
    const map = mockMap();
    map.getPitch = () => 12;
    attachSiMapGisCameraController(map as never, { getIs3d: () => false });
    map.emit('move');
    expect(map.jumpTo).toHaveBeenCalledWith({ pitch: 0, duration: 0 });
  });
});
