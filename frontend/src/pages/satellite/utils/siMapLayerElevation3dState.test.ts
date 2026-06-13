import { describe, expect, it, beforeEach } from 'vitest';
import {
  bindSiMapLayerSyncElevation3dRef,
  resolveSiMapLayerMountElevation3d,
  resetSiMapLayerSyncElevation3dForTests,
} from './siMapLayerElevation3dState';

describe('siMapLayerElevation3dState', () => {
  beforeEach(() => {
    resetSiMapLayerSyncElevation3dForTests();
  });

  it('resolveSiMapLayerMountElevation3d prefers live 3D ref over stale false opts', () => {
    bindSiMapLayerSyncElevation3dRef({ current: true });
    expect(resolveSiMapLayerMountElevation3d({ elevation3d: false })).toBe(true);
  });

  it('resolveSiMapLayerMountElevation3d returns false when ref is false', () => {
    bindSiMapLayerSyncElevation3dRef({ current: false });
    expect(resolveSiMapLayerMountElevation3d({ elevation3d: false })).toBe(false);
    expect(resolveSiMapLayerMountElevation3d(undefined)).toBe(false);
  });

  it('resolveSiMapLayerMountElevation3d honors explicit true when ref false', () => {
    bindSiMapLayerSyncElevation3dRef({ current: false });
    expect(resolveSiMapLayerMountElevation3d({ elevation3d: true })).toBe(true);
  });
});
