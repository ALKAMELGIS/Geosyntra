/** Guards layer reconcile / remount while 2D ↔ 3D elevation transition is running. */

let transitionActiveRef: { current: boolean } = { current: false };
let projectionSwitchingRef: { current: boolean } = { current: false };
/** 0 = full 2D symbology, 1 = full 3D extrusion symbology. */
let blendToward3d = 0;

export function bindSiMapLayerTransitionRef(ref: { current: boolean }): void {
  transitionActiveRef = ref;
}

export function bindSiMapProjectionSwitchRef(ref: { current: boolean }): void {
  projectionSwitchingRef = ref;
}

/** Elevation morph or mercator ↔ globe projection — block structural layer mutations. */
export function isSiMapViewTransitionActive(): boolean {
  return transitionActiveRef.current || projectionSwitchingRef.current;
}

export function isSiMapElevationTransitionActive(): boolean {
  return isSiMapViewTransitionActive();
}

/** Normalized blend toward 3D (0–1). Frozen at target when not transitioning. */
export function getSiMapLayerTransitionBlendToward3d(): number {
  return blendToward3d;
}

export function setSiMapLayerTransitionBlendToward3d(t: number): void {
  blendToward3d = Math.min(1, Math.max(0, t));
}

export function resetSiMapLayerTransitionBlend(final3d: boolean): void {
  blendToward3d = final3d ? 1 : 0;
}

export function resetSiMapLayerTransitionGuardForTests(): void {
  transitionActiveRef = { current: false };
  projectionSwitchingRef = { current: false };
  blendToward3d = 0;
}
