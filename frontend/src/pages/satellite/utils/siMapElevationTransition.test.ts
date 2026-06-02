import { describe, expect, it, vi } from 'vitest';
import {
  resolveSiElevationTransitionTargetCamera,
  runSiMapElevationViewTransition,
  siElevationCrossfadeOpacity,
  siElevationTransitionEase,
} from './siMapElevationTransition';
import { SI_ELEVATION_VIEW_PITCH, SI_DEFAULT_TERRAIN_SETTINGS } from './siMapProjectionTerrain';

describe('siMapElevationTransition', () => {
  it('eases from 0 to 1 with smooth ends', () => {
    expect(siElevationTransitionEase(0)).toBe(0);
    expect(siElevationTransitionEase(1)).toBe(1);
    expect(siElevationTransitionEase(0.5)).toBeGreaterThan(0.4);
    expect(siElevationTransitionEase(0.5)).toBeLessThan(0.6);
  });

  it('peaks crossfade veil mid-transition', () => {
    expect(siElevationCrossfadeOpacity(0)).toBe(0);
    expect(siElevationCrossfadeOpacity(1)).toBeCloseTo(0, 5);
    expect(siElevationCrossfadeOpacity(0.5)).toBeGreaterThan(siElevationCrossfadeOpacity(0.2));
  });

  it('preserves center and zoom in target camera', () => {
    const camera = {
      longitude: 55.27,
      latitude: 25.2,
      zoom: 14.2,
      bearing: 12,
      pitch: 0,
    };
    const up = resolveSiElevationTransitionTargetCamera(true, camera, {
      ...SI_DEFAULT_TERRAIN_SETTINGS,
      elevationPitch: SI_ELEVATION_VIEW_PITCH,
    });
    expect(up.longitude).toBe(camera.longitude);
    expect(up.latitude).toBe(camera.latitude);
    expect(up.zoom).toBe(camera.zoom);
    expect(up.bearing).toBe(camera.bearing);
    expect(up.pitch).toBeGreaterThanOrEqual(SI_ELEVATION_VIEW_PITCH);

    const down = resolveSiElevationTransitionTargetCamera(false, up, SI_DEFAULT_TERRAIN_SETTINGS);
    expect(down.pitch).toBe(0);
  });

  it('runSiMapElevationViewTransition uses easeTo with fixed zoom (no jumpTo loop)', () => {
    const easeTo = vi.fn();
    const jumpTo = vi.fn();
    const setTerrain = vi.fn();
    let moveEndHandler: (() => void) | undefined;
    const map = {
      getSource: () => ({}),
      getTerrain: () => ({ exaggeration: 0 }),
      setProjection: vi.fn(),
      setTerrain,
      easeTo,
      jumpTo,
      once: (_: string, cb: () => void) => {
        moveEndHandler = cb;
      },
      off: vi.fn(),
      getProjection: () => ({ name: 'globe' }),
      getCanvas: () => ({ clientHeight: 800 }),
      getContainer: () => ({ clientHeight: 800 }),
    } as unknown as import('mapbox-gl').Map;

    vi.stubGlobal(
      'requestAnimationFrame',
      (cb: FrameRequestCallback) => {
        cb(performance.now() + 800);
        return 1;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('clearTimeout', vi.fn());
    vi.stubGlobal('setTimeout', (cb: () => void) => {
      cb();
      return 0;
    });

    const onComplete = vi.fn();
    runSiMapElevationViewTransition(
      map,
      true,
      { longitude: 0, latitude: 0, zoom: 10, bearing: 0, pitch: 0 },
      { ...SI_DEFAULT_TERRAIN_SETTINGS, buildings: true },
      { durationMs: 720, onComplete },
    );

    expect(easeTo).toHaveBeenCalledTimes(1);
    const easeArgs = easeTo.mock.calls[0]![0];
    expect(easeArgs.zoom).toBe(10);
    expect(easeArgs.center).toEqual([0, 0]);
    moveEndHandler?.();
    expect(onComplete).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
