import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SI_ESRI_3D_TERRAIN_SSE_IDLE,
  SI_ESRI_3D_TERRAIN_SSE_MOVING,
  bindSiMap3dTerrainCameraPerformance,
  isSiMap3dTerrainCameraMoving,
  registerSiMap3dTerrainOverlay,
  resetSiMap3dTerrainCameraPerformanceForTests,
  siMap3dTerrainDeferWmsRasterSync,
  siMap3dTerrainRunWhenCameraIdle,
  uninstallSiMap3dTerrainCameraPerformance,
} from './siMap3dTerrainCameraPerformance';

describe('siMap3dTerrainCameraPerformance', () => {
  beforeEach(() => {
    resetSiMap3dTerrainCameraPerformanceForTests();
  });

  it('raises Esri SSE while camera moves and restores on move end', async () => {
    const listeners = new Map<string, Set<() => void>>();
    const map = {
      on: vi.fn((event: string, fn: () => void) => {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(fn);
      }),
      off: vi.fn((event: string, fn: () => void) => {
        listeners.get(event)?.delete(fn);
      }),
      triggerRepaint: vi.fn(),
    };

    const applied: number[] = [];
    bindSiMap3dTerrainCameraPerformance(map as never);
    registerSiMap3dTerrainOverlay(map as never, {
      kind: 'esri',
      applyScreenSpaceError: sse => applied.push(sse),
    });

    expect(applied[applied.length - 1]).toBe(SI_ESRI_3D_TERRAIN_SSE_IDLE);

    listeners.get('movestart')?.forEach(fn => fn());
    expect(isSiMap3dTerrainCameraMoving()).toBe(true);
    expect(applied[applied.length - 1]).toBe(SI_ESRI_3D_TERRAIN_SSE_MOVING);

    let idleRan = false;
    siMap3dTerrainRunWhenCameraIdle(() => {
      idleRan = true;
    });
    expect(idleRan).toBe(false);

    listeners.get('moveend')?.forEach(fn => fn());
    expect(isSiMap3dTerrainCameraMoving()).toBe(false);
    expect(applied[applied.length - 1]).toBe(SI_ESRI_3D_TERRAIN_SSE_IDLE);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(map.triggerRepaint).toHaveBeenCalled();

    siMap3dTerrainRunWhenCameraIdle(() => {
      idleRan = true;
    });
    expect(idleRan).toBe(true);

    uninstallSiMap3dTerrainCameraPerformance(map as never);
  });

  it('defers Sentinel WMS tile sync until camera stops', () => {
    const listeners = new Map<string, Set<() => void>>();
    const map = {
      on: vi.fn((event: string, fn: () => void) => {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(fn);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    bindSiMap3dTerrainCameraPerformance(map as never);

    const applied: string[] = [];
    const apply = (_m: unknown, _runs: unknown, legacy?: string | null) => {
      applied.push(legacy ?? '');
    };

    listeners.get('movestart')?.forEach(fn => fn());
    siMap3dTerrainDeferWmsRasterSync(map as never, null, 'tile-a', apply);
    expect(applied).toEqual([]);

    listeners.get('moveend')?.forEach(fn => fn());
    expect(applied).toEqual(['tile-a']);
  });
});
