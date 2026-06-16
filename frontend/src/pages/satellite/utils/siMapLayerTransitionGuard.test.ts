import { describe, expect, it, beforeEach } from 'vitest';
import {
  bindSiMapLayerTransitionRef,
  bindSiMapProjectionSwitchRef,
  getSiMapLayerTransitionBlendToward3d,
  isSiMapElevationTransitionActive,
  isSiMapViewTransitionActive,
  resetSiMapLayerTransitionBlend,
  resetSiMapLayerTransitionGuardForTests,
  setSiMapLayerTransitionBlendToward3d,
} from './siMapLayerTransitionGuard';
import {
  resetSiMapLayerSyncElevation3dForTests,
  resolveSiMapLayerMountElevation3d,
  siMapLayerSyncElevation3dActive,
} from './siMapLayerElevation3dState';

describe('siMapLayerTransitionGuard', () => {
  beforeEach(() => {
    resetSiMapLayerTransitionGuardForTests();
    resetSiMapLayerSyncElevation3dForTests();
  });

  it('tracks transition active ref', () => {
    const ref = { current: false };
    bindSiMapLayerTransitionRef(ref);
    expect(isSiMapElevationTransitionActive()).toBe(false);
    ref.current = true;
    expect(isSiMapElevationTransitionActive()).toBe(true);
    expect(isSiMapViewTransitionActive()).toBe(true);
    ref.current = false;
    expect(isSiMapViewTransitionActive()).toBe(false);
  });

  it('tracks projection switch ref', () => {
    const projectionRef = { current: false };
    bindSiMapProjectionSwitchRef(projectionRef);
    expect(isSiMapViewTransitionActive()).toBe(false);
    projectionRef.current = true;
    expect(isSiMapViewTransitionActive()).toBe(true);
    expect(isSiMapElevationTransitionActive()).toBe(true);
  });

  it('clamps blend toward 3D', () => {
    setSiMapLayerTransitionBlendToward3d(1.5);
    expect(getSiMapLayerTransitionBlendToward3d()).toBe(1);
    setSiMapLayerTransitionBlendToward3d(-0.2);
    expect(getSiMapLayerTransitionBlendToward3d()).toBe(0);
  });

  it('resetSiMapLayerTransitionBlend sets final target', () => {
    resetSiMapLayerTransitionBlend(true);
    expect(getSiMapLayerTransitionBlendToward3d()).toBe(1);
    resetSiMapLayerTransitionBlend(false);
    expect(getSiMapLayerTransitionBlendToward3d()).toBe(0);
  });

  it('resolveSiMapLayerMountElevation3d uses blend during transition', () => {
    const transitionRef = { current: true };
    bindSiMapLayerTransitionRef(transitionRef);
    setSiMapLayerTransitionBlendToward3d(0.2);
    expect(resolveSiMapLayerMountElevation3d({ elevation3d: true })).toBe(false);
    expect(siMapLayerSyncElevation3dActive()).toBe(false);
    setSiMapLayerTransitionBlendToward3d(0.8);
    expect(resolveSiMapLayerMountElevation3d({ elevation3d: false })).toBe(true);
    expect(siMapLayerSyncElevation3dActive()).toBe(true);
  });
});
