import { describe, expect, it, beforeEach } from 'vitest';
import {
  hasAnyCustomLayerRefreshInFlight,
  isSiMapCameraInteracting,
  resetSiMapLayerCameraSyncGuardForTests,
  shouldPauseSiCustomLayerMapSync,
} from './siMapLayerCameraSyncGuard';
import {
  bindSiMapLayerTransitionRef,
  resetSiMapLayerTransitionGuardForTests,
} from './siMapLayerTransitionGuard';
import {
  buildSiCustomLayerRefreshJobId,
  isSiCustomLayerBackgroundJobRunning,
  runSiCustomLayerBackgroundJob,
} from './siMapLayerRefreshCoordinator';
import {
  buildSiLayerDataCacheKey,
  getSiLayerDataCache,
  setSiLayerDataCache,
} from './siMapLayerDataCache';

describe('siMapLayerCameraSyncGuard', () => {
  beforeEach(() => {
    resetSiMapLayerCameraSyncGuardForTests();
    resetSiMapLayerTransitionGuardForTests();
  });

  it('shouldPauseSiCustomLayerMapSync when layer is refreshing', () => {
    expect(
      shouldPauseSiCustomLayerMapSync([
        { id: 'a', name: 'A', loadStatus: 'refreshing' },
      ]),
    ).toBe(true);
  });

  it('hasAnyCustomLayerRefreshInFlight detects loading', () => {
    expect(hasAnyCustomLayerRefreshInFlight([{ id: 'a', name: 'A', loadStatus: 'loading' }])).toBe(true);
  });

  it('starts with camera not interacting', () => {
    expect(isSiMapCameraInteracting()).toBe(false);
  });

  it('shouldPauseSiCustomLayerMapSync during elevation transition', () => {
    const ref = { current: true };
    bindSiMapLayerTransitionRef(ref);
    expect(shouldPauseSiCustomLayerMapSync([])).toBe(true);
  });
});

describe('siMapLayerRefreshCoordinator', () => {
  it('runSiCustomLayerBackgroundJob dedupes same job id', async () => {
    let runs = 0;
    const p1 = runSiCustomLayerBackgroundJob('lyr', 'job-1', async () => {
      runs += 1;
      return 'ok';
    });
    const p2 = runSiCustomLayerBackgroundJob('lyr', 'job-1', async () => {
      runs += 1;
      return 'fail';
    });
    expect(await p1).toBe('ok');
    expect(await p2).toBe('ok');
    expect(runs).toBe(1);
    expect(isSiCustomLayerBackgroundJobRunning('lyr')).toBe(false);
  });

  it('buildSiCustomLayerRefreshJobId is stable for same layer revision', () => {
    const layer = { id: 'x', name: 'X', mapRenderRevision: 2 };
    expect(buildSiCustomLayerRefreshJobId(layer, 'src')).toBe('x:src:2');
  });
});

describe('siMapLayerDataCache', () => {
  it('stores and retrieves geojson by key', () => {
    const key = buildSiLayerDataCacheKey('lyr', 'https://example.com/fs');
    const gj = { type: 'FeatureCollection', features: [] };
    setSiLayerDataCache(key, gj, 'https://example.com/fs');
    expect(getSiLayerDataCache(key)).toEqual(gj);
  });
});
