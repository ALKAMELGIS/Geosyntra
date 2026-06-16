import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySiMapWmsRasterDoubleBuffered,
  flushSiMapWmsRasterDoubleBuffer,
  resetSiMapWmsRasterDoubleBufferForTests,
} from './siMapWmsRasterDoubleBuffer';
import { resetSiMapLayerCameraSyncGuardForTests } from './siMapLayerCameraSyncGuard';
import { setSiMap3dTerrainCameraMoving } from './siMap3dTerrainCameraMoving';

describe('siMapWmsRasterDoubleBuffer', () => {
  beforeEach(() => {
    resetSiMapWmsRasterDoubleBufferForTests();
    resetSiMapLayerCameraSyncGuardForTests();
    setSiMap3dTerrainCameraMoving(false);
  });

  it('applies immediately when pipeline is idle', () => {
    const map = {} as never;
    const apply = vi.fn();
    applySiMapWmsRasterDoubleBuffered(map, null, 'tile-a', apply);
    expect(apply).toHaveBeenCalledWith(map, null, 'tile-a');
  });

  it('buffers tile updates while camera moves and swaps on flush', () => {
    const map = {} as never;
    const apply = vi.fn();

    setSiMap3dTerrainCameraMoving(true);
    applySiMapWmsRasterDoubleBuffered(map, null, 'tile-a', apply);
    expect(apply).not.toHaveBeenCalled();

    applySiMapWmsRasterDoubleBuffered(map, null, 'tile-b', apply);
    expect(apply).not.toHaveBeenCalled();

    setSiMap3dTerrainCameraMoving(false);
    flushSiMapWmsRasterDoubleBuffer(map, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(map, null, 'tile-b');
  });

  it('skips flush when back buffer matches front buffer', () => {
    const map = {} as never;
    const apply = vi.fn();

    applySiMapWmsRasterDoubleBuffered(map, null, 'tile-a', apply);
    expect(apply).toHaveBeenCalledTimes(1);

    setSiMap3dTerrainCameraMoving(true);
    applySiMapWmsRasterDoubleBuffered(map, null, 'tile-a', apply);
    setSiMap3dTerrainCameraMoving(false);
    flushSiMapWmsRasterDoubleBuffer(map, apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
