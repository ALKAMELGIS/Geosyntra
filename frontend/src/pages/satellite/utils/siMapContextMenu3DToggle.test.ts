import { describe, expect, it, vi } from 'vitest';
import {
  applySiMapContextMenuEnable2D,
  applySiMapContextMenuEnable3D,
  buildSiMapElevationToggleCameraAtCenter,
  resolveSiMapContextMenuToggle3D,
  shouldBlockSiMapContextMenuToggle3D,
  SI_MAP_CONTEXT_MENU_3D_TOGGLE_DURATION_MS,
  toggleSiMap3DModeAtCenter,
} from './siMapContextMenu3DToggle';

describe('siMapContextMenu3DToggle', () => {
  it('uses 800ms ease for context-menu toggle', () => {
    expect(SI_MAP_CONTEXT_MENU_3D_TOGGLE_DURATION_MS).toBe(800);
  });

  it('resolveSiMapContextMenuToggle3D flips dock mode', () => {
    expect(resolveSiMapContextMenuToggle3D(false)).toBe(true);
    expect(resolveSiMapContextMenuToggle3D(true)).toBe(false);
  });

  it('shouldBlockSiMapContextMenuToggle3D blocks only when orbit drag moved', () => {
    expect(
      shouldBlockSiMapContextMenuToggle3D({ orbitDragActive: false, orbitDragMoved: false }),
    ).toBe(false);
    expect(
      shouldBlockSiMapContextMenuToggle3D({ orbitDragActive: true, orbitDragMoved: false }),
    ).toBe(false);
    expect(
      shouldBlockSiMapContextMenuToggle3D({ orbitDragActive: true, orbitDragMoved: true }),
    ).toBe(true);
  });

  it('buildSiMapElevationToggleCameraAtCenter pivots at click without resetting zoom', () => {
    const map = {
      getZoom: () => 9.5,
      getBearing: () => 45,
      getPitch: () => 0,
      getCenter: () => ({ lng: 10, lat: 20 }),
    } as unknown as import('mapbox-gl').Map;

    const enter3d = buildSiMapElevationToggleCameraAtCenter(
      map,
      { lng: 30, lat: 15 },
      true,
      { elevationPitch: 60 } as import('./siMapProjectionTerrain').SiMapTerrainSettings,
    );
    expect(enter3d.longitude).toBe(30);
    expect(enter3d.latitude).toBe(15);
    expect(enter3d.zoom).toBe(9.5);
    expect(enter3d.bearing).toBe(45);
    expect(enter3d.pitch).toBe(60);

    const exit2d = buildSiMapElevationToggleCameraAtCenter(
      map,
      { lng: 30, lat: 15 },
      false,
      { elevationPitch: 60 } as import('./siMapProjectionTerrain').SiMapTerrainSettings,
    );
    expect(exit2d.pitch).toBe(0);
    expect(exit2d.bearing).toBe(0);
    expect(exit2d.zoom).toBe(9.5);
  });

  it('applySiMapContextMenuEnable3D eases at click without resetting zoom or bearing', () => {
    const easeTo = vi.fn();
    const setProjection = vi.fn();
    const map = {
      getZoom: () => 9.5,
      getBearing: () => 45,
      getPitch: () => 0,
      getCenter: () => ({ lng: 10, lat: 20 }),
      getCanvas: () => ({ clientHeight: 640 }),
      getContainer: () => ({ clientHeight: 640 }),
      easeTo,
      setProjection,
    } as unknown as import('mapbox-gl').Map;

    applySiMapContextMenuEnable3D(map, { lng: 30, lat: 15 }, { elevationPitch: 60 });
    expect(setProjection).toHaveBeenCalledWith({ name: 'globe' });
    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [30, 15],
        zoom: 9.5,
        bearing: 45,
        pitch: 60,
        duration: 800,
        essential: true,
      }),
    );
  });

  it('applySiMapContextMenuEnable2D flattens pitch and bearing at click', () => {
    const easeTo = vi.fn();
    const map = {
      getZoom: () => 9.5,
      getBearing: () => 45,
      getPitch: () => 60,
      getCenter: () => ({ lng: 10, lat: 20 }),
      easeTo,
      setProjection: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    applySiMapContextMenuEnable2D(map, { lng: 30, lat: 15 });
    expect(easeTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [30, 15],
        zoom: 9.5,
        bearing: 0,
        pitch: 0,
        duration: 800,
      }),
    );
  });

  it('toggleSiMap3DModeAtCenter flips between enable3D and enable2D', () => {
    const easeTo = vi.fn();
    const setProjection = vi.fn();
    const map = {
      getZoom: () => 9.5,
      getBearing: () => 45,
      getPitch: () => 0,
      getCenter: () => ({ lng: 10, lat: 20 }),
      getCanvas: () => ({ clientHeight: 640 }),
      getContainer: () => ({ clientHeight: 640 }),
      easeTo,
      setProjection,
    } as unknown as import('mapbox-gl').Map;

    expect(toggleSiMap3DModeAtCenter(map, { lng: 30, lat: 15 }, false, { elevationPitch: 60 })).toBe(
      true,
    );
    expect(toggleSiMap3DModeAtCenter(map, { lng: 30, lat: 15 }, true, { elevationPitch: 60 })).toBe(
      false,
    );
    expect(easeTo).toHaveBeenCalledTimes(2);
  });
});
