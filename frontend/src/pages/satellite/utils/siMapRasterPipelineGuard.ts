import { isSiTimelinePlaybackBlocked } from './siMapCaptureSession';
import { isSiMapCameraInteracting } from './siMapLayerCameraSyncGuard';
import { isSiMapViewTransitionActive } from './siMapLayerTransitionGuard';

/**
 * Sentinel / WMS / AOI vector pipelines must not mutate while the camera moves,
 * globe 2D ↔ 3D transitions run, or timeline capture is active.
 */
export function isSiMapRasterPipelineFrozen(): boolean {
  return (
    isSiMapCameraInteracting() ||
    isSiMapViewTransitionActive() ||
    isSiTimelinePlaybackBlocked()
  );
}

/** Alias — structural layer work (add/remove source, setTiles, reconcile). */
export function isSiMapDataLayerMutationFrozen(): boolean {
  return isSiMapRasterPipelineFrozen();
}

let interactionOverlayRaf = 0;
const interactionOverlayFrameQueue = new Set<() => void>();

/** rAF-throttled UI-only overlay work (highlights, tooltips) — never touches raster tiles. */
export function scheduleSiMapInteractionOverlayFrame(fn: () => void): void {
  interactionOverlayFrameQueue.add(fn);
  if (interactionOverlayRaf !== 0) return;
  interactionOverlayRaf = requestAnimationFrame(() => {
    interactionOverlayRaf = 0;
    const batch = [...interactionOverlayFrameQueue];
    interactionOverlayFrameQueue.clear();
    for (const run of batch) {
      try {
        run();
      } catch {
        /* overlay fault */
      }
    }
  });
}

export function cancelSiMapInteractionOverlayFrames(): void {
  if (interactionOverlayRaf !== 0) {
    cancelAnimationFrame(interactionOverlayRaf);
    interactionOverlayRaf = 0;
  }
  interactionOverlayFrameQueue.clear();
}

let pointerHudRaf = 0;
let pendingPointerHud: { lng: number; lat: number } | null = null;
let pointerHudCommit: ((point: { lng: number; lat: number }) => void) | null = null;

/** Bind React HUD commit (WGS84 status bar) — throttled via rAF, decoupled from raster pipeline. */
export function bindSiMapPointerHudCommit(fn: (point: { lng: number; lat: number }) => void): void {
  pointerHudCommit = fn;
}

export function unbindSiMapPointerHudCommit(): void {
  pointerHudCommit = null;
  pendingPointerHud = null;
  if (pointerHudRaf !== 0) {
    cancelAnimationFrame(pointerHudRaf);
    pointerHudRaf = 0;
  }
}

/**
 * Record pointer WGS84 in a ref on every move; commit React state at most once per frame.
 * Skips React commits entirely while the raster pipeline is frozen (pan/zoom/timeline).
 */
export function recordSiMapPointerHud(
  ref: { current: { lng: number; lat: number } | null },
  lng: number,
  lat: number,
): void {
  ref.current = { lng, lat };
  if (isSiMapRasterPipelineFrozen() || !pointerHudCommit) return;
  pendingPointerHud = { lng, lat };
  if (pointerHudRaf !== 0) return;
  pointerHudRaf = requestAnimationFrame(() => {
    pointerHudRaf = 0;
    const point = pendingPointerHud;
    pendingPointerHud = null;
    if (!point || !pointerHudCommit) return;
    pointerHudCommit(point);
  });
}

/** Commit the latest ref snapshot (e.g. on moveend). */
export function flushSiMapPointerHudCommit(ref: { current: { lng: number; lat: number } | null }): void {
  if (!ref.current || !pointerHudCommit) return;
  pointerHudCommit(ref.current);
}

export function resetSiMapRasterPipelineGuardForTests(): void {
  cancelSiMapInteractionOverlayFrames();
  unbindSiMapPointerHudCommit();
}
