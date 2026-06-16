import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindSiMapPointerHudCommit,
  flushSiMapPointerHudCommit,
  recordSiMapPointerHud,
  resetSiMapRasterPipelineGuardForTests,
  scheduleSiMapInteractionOverlayFrame,
} from './siMapRasterPipelineGuard';
import { resetSiMapLayerCameraSyncGuardForTests } from './siMapLayerCameraSyncGuard';
import { setSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraMoving';

describe('siMapRasterPipelineGuard', () => {
  beforeEach(() => {
    resetSiMapRasterPipelineGuardForTests();
    resetSiMapLayerCameraSyncGuardForTests();
    setSiMap3dTerrainCameraMoving(false);
  });

  afterEach(() => {
    resetSiMapRasterPipelineGuardForTests();
    resetSiMapLayerCameraSyncGuardForTests();
    setSiMap3dTerrainCameraMoving(false);
  });

  it('batches interaction overlay callbacks to one rAF frame', async () => {
    const runs: number[] = [];
    scheduleSiMapInteractionOverlayFrame(() => runs.push(1));
    scheduleSiMapInteractionOverlayFrame(() => runs.push(2));
    expect(runs).toEqual([]);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(runs).toEqual([1, 2]);
  });

  it('throttles pointer HUD commits while camera is moving', async () => {
    const commits: Array<{ lng: number; lat: number }> = [];
    bindSiMapPointerHudCommit(point => commits.push(point));
    const ref = { current: null as { lng: number; lat: number } | null };

    setSiMap3dTerrainCameraMoving(true);
    recordSiMapPointerHud(ref, 1, 2);
    recordSiMapPointerHud(ref, 3, 4);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(ref.current).toEqual({ lng: 3, lat: 4 });
    expect(commits).toEqual([]);

    flushSiMapPointerHudCommit(ref);
    expect(commits).toEqual([{ lng: 3, lat: 4 }]);
  });

  it('commits pointer HUD via rAF when pipeline is not frozen', async () => {
    const commits: Array<{ lng: number; lat: number }> = [];
    bindSiMapPointerHudCommit(point => commits.push(point));
    const ref = { current: null as { lng: number; lat: number } | null };

    recordSiMapPointerHud(ref, 10, 20);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(commits).toEqual([{ lng: 10, lat: 20 }]);
  });
});
