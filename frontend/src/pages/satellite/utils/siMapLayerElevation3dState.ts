import type { SiCustomLayerMapMountOptions } from './siMapCustomLayerRegistry';
import {
  getSiMapLayerTransitionBlendToward3d,
  isSiMapElevationTransitionActive,
} from './siMapLayerTransitionGuard';

/** Bound to `customLayerExtrusion3dRef` (globeView3dActive) in SatelliteIntelligenceMain — SSOT for extrusion mode. */
let elevation3dRef: { current: boolean } = { current: false };

export function bindSiMapLayerSyncElevation3dRef(ref: { current: boolean }): void {
  elevation3dRef = ref;
}

export function siMapLayerSyncElevation3dActive(): boolean {
  if (isSiMapElevationTransitionActive()) {
    return getSiMapLayerTransitionBlendToward3d() >= 0.5;
  }
  return elevation3dRef.current;
}

/** Prefer live 3D dock state over stale mount opts (fixes deferred sync reverting to 2D). */
export function resolveSiMapLayerMountElevation3d(opts?: SiCustomLayerMapMountOptions): boolean {
  if (isSiMapElevationTransitionActive()) {
    return getSiMapLayerTransitionBlendToward3d() >= 0.5;
  }
  if (elevation3dRef.current) return true;
  return opts?.elevation3d ?? false;
}

export function withSiMapLayerMountElevation3d(
  opts?: SiCustomLayerMapMountOptions,
): SiCustomLayerMapMountOptions {
  return { ...opts, elevation3d: resolveSiMapLayerMountElevation3d(opts) };
}

export function resetSiMapLayerSyncElevation3dForTests(): void {
  elevation3dRef = { current: false };
}
