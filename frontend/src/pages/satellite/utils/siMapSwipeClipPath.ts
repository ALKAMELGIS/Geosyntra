import type { SiMapSwipeMode } from './siMapSwipeTypes';
import { SI_MAP_SWIPE_SPYGLASS_RADIUS_PX } from './siMapSwipeTypes';

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

/**
 * CSS clip-path for the compare map pane (shows “after” imagery inside the reveal region).
 * Base map underneath stays at the current timeline date.
 */
export function buildSiMapSwipeClipPath(
  mode: SiMapSwipeMode,
  normX: number,
  normY: number,
  opts?: { spyglassRadiusPx?: number },
): string {
  const x = clamp01(normX);
  const y = clamp01(normY);
  const r = opts?.spyglassRadiusPx ?? SI_MAP_SWIPE_SPYGLASS_RADIUS_PX;

  if (mode === 'vertical') {
    const leftPct = (x * 100).toFixed(4);
    return `inset(0 0 0 ${leftPct}%)`;
  }
  if (mode === 'horizontal') {
    const topPct = (y * 100).toFixed(4);
    return `inset(${topPct}% 0 0 0)`;
  }
  const cx = (x * 100).toFixed(4);
  const cy = (y * 100).toFixed(4);
  return `circle(${r}px at ${cx}% ${cy}%)`;
}
