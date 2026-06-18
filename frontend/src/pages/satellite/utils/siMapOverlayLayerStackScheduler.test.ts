import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  cancelSiMapOverlayLayerStackSync,
  scheduleSiMapOverlayLayerStackSync,
} from './siMapOverlayLayerStackScheduler';

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
