import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  cancelSiMapOverlayLayerStackSync,
  scheduleSiMapOverlayLayerStackSync,
} from './siMapOverlayLayerStackScheduler';
import {
  installSiMapLayerCameraSyncGuard,
  resetSiMapLayerCameraSyncGuardForTests,
} from './siMapLayerCameraSyncGuard';

describe('siMapOverlayLayerStackScheduler', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSiMapLayerCameraSyncGuardForTests();
  });

  it('defers immediate stack sync while the camera is moving', () => {
    const moveLayer = vi.fn();
    const listeners: Record<string, Array<() => void>> = {};
    const map = {
      on: (event: string, fn: () => void) => {
        (listeners[event] ??= []).push(fn);
      },
      off: vi.fn(),
      getStyle: () => ({ layers: [{ id: 'a' }, { id: 'b' }] }),
      getLayer: (id: string) => (id ? {} : null),
      moveLayer,
      triggerRepaint: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    installSiMapLayerCameraSyncGuard(map);
    listeners.movestart?.forEach(fn => fn());

    scheduleSiMapOverlayLayerStackSync(map, { immediate: true, force: true });
    expect(moveLayer).not.toHaveBeenCalled();

    cancelSiMapOverlayLayerStackSync(map);
  });

  it('skips redundant stack sync when layer order unchanged', () => {
    const moveLayer = vi.fn();
    const map = {
      getStyle: () => ({ layers: [{ id: 'a' }, { id: 'b' }] }),
      getLayer: (id: string) => (id ? {} : null),
      moveLayer,
      triggerRepaint: vi.fn(),
    } as unknown as import('mapbox-gl').Map;

    scheduleSiMapOverlayLayerStackSync(map, { immediate: true });
    expect(moveLayer.mock.calls.length).toBeGreaterThan(0);
    const firstCount = moveLayer.mock.calls.length;

    scheduleSiMapOverlayLayerStackSync(map, { immediate: true });
    expect(moveLayer.mock.calls.length).toBe(firstCount);

    cancelSiMapOverlayLayerStackSync(map);
  });
});
