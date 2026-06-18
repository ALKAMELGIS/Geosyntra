import { describe, expect, it, vi } from 'vitest';
import {
  lngLatBoundsFromGeometry,
  siMapSmoothNavigateToBounds,
  siMapSmoothNavigateToLngLat,
} from './siMapSmoothNavigate';

describe('siMapSmoothNavigate', () => {
  it('derives bounds from polygon geometry', () => {
    const bounds = lngLatBoundsFromGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [1, 2],
          [3, 2],
          [3, 4],
          [1, 4],
          [1, 2],
        ],
      ],
    });
    expect(bounds).toEqual([1, 2, 3, 4]);
  });

  it('easeTo resolves after moveend', async () => {
    vi.useFakeTimers();
    const listeners: Record<string, Array<() => void>> = {};
    const map = {
      getZoom: () => 2,
      getCenter: () => ({ lng: 0, lat: 0 }),
      getBearing: () => 0,
      getPitch: () => 0,
      easeTo: vi.fn(),
      once: (event: string, cb: () => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      },
      off: (event: string, cb: () => void) => {
        listeners[event] = (listeners[event] ?? []).filter(h => h !== cb);
      },
    };
    const p = siMapSmoothNavigateToLngLat(map, 54.86, 24.76, { duration: 500, zoom: 15 });
    vi.advanceTimersByTime(520);
    listeners.moveend?.forEach(fn => fn());
    const cam = await p;
    expect(map.easeTo).toHaveBeenCalled();
    expect(cam?.zoom).toBe(2);
    vi.useRealTimers();
  });

  it('fitBounds resolves after moveend', async () => {
    vi.useFakeTimers();
    const listeners: Record<string, Array<() => void>> = {};
    const map = {
      fitBounds: vi.fn(),
      getCenter: () => ({ lng: 2, lat: 3 }),
      getZoom: () => 14,
      getBearing: () => 0,
      getPitch: () => 0,
      once: (event: string, cb: () => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(cb);
      },
      off: (event: string, cb: () => void) => {
        listeners[event] = (listeners[event] ?? []).filter(h => h !== cb);
      },
    };
    const p = siMapSmoothNavigateToBounds(map, [1, 2, 3, 4], { duration: 600 });
    vi.advanceTimersByTime(620);
    listeners.moveend?.forEach(fn => fn());
    await p;
    expect(map.fitBounds).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
