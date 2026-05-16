import { useCallback, useEffect, useRef, useState } from 'react';

export type SiTimelineTransitionMode = 'step' | 'smooth';

export type WmsTimeExtent = { start: string; end: string };

export const SI_WMS_CROSSFADE_MS = 520;

const STORAGE_KEY = 'geosyntra-si-timeline-transition';

export function loadTimelineTransitionMode(): SiTimelineTransitionMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'step' || v === 'smooth') return v;
  } catch {
    /* ignore */
  }
  return 'smooth';
}

export function saveTimelineTransitionMode(mode: SiTimelineTransitionMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function extentsEqual(a: WmsTimeExtent, b: WmsTimeExtent): boolean {
  return a.start === b.start && a.end === b.end;
}

/**
 * Dual-frame WMS time extent for map crossfade (legacy single-AOI Sentinel stack).
 * In step mode both frames match the target; in smooth mode `blend` animates 0→1 then commits.
 */
export function useSiWmsTimelineCrossfade(targetExtent: WmsTimeExtent, mode: SiTimelineTransitionMode) {
  const [frameFrom, setFrameFrom] = useState<WmsTimeExtent>(targetExtent);
  const [frameTo, setFrameTo] = useState<WmsTimeExtent>(targetExtent);
  const [blend, setBlend] = useState(0);
  const animRef = useRef<number | null>(null);
  const blendRef = useRef(0);
  const frameFromRef = useRef(frameFrom);
  const frameToRef = useRef(frameTo);
  const mountedRef = useRef(false);

  frameFromRef.current = frameFrom;
  frameToRef.current = frameTo;
  blendRef.current = blend;

  const cancelAnim = useCallback(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  const snapTo = useCallback(
    (extent: WmsTimeExtent) => {
      cancelAnim();
      setFrameFrom(extent);
      setFrameTo(extent);
      setBlend(0);
      blendRef.current = 0;
    },
    [cancelAnim],
  );

  const transitionTo = useCallback(
    (next: WmsTimeExtent) => {
      if (extentsEqual(next, frameToRef.current) && blendRef.current >= 0.999) return;

      cancelAnim();

      const committed =
        blendRef.current > 0.5 ? frameToRef.current : frameFromRef.current;
      setFrameFrom(committed);
      setFrameTo(next);
      setBlend(0);
      blendRef.current = 0;

      const t0 = performance.now();
      let lastBlendEmit = 0;
      const tick = (now: number) => {
        const p = smoothstep((now - t0) / SI_WMS_CROSSFADE_MS);
        blendRef.current = p;
        if (now - lastBlendEmit >= 32 || p >= 1) {
          lastBlendEmit = now;
          setBlend(p);
        }
        if (p < 1) {
          animRef.current = requestAnimationFrame(tick);
        } else {
          setFrameFrom(next);
          setFrameTo(next);
          setBlend(0);
          blendRef.current = 0;
          animRef.current = null;
        }
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [cancelAnim],
  );

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      snapTo(targetExtent);
      return;
    }
    if (mode === 'step') {
      snapTo(targetExtent);
      return;
    }
    if (extentsEqual(targetExtent, frameToRef.current) && blendRef.current < 0.001) return;
    transitionTo(targetExtent);
  }, [targetExtent.start, targetExtent.end, mode, snapTo, transitionTo]);

  useEffect(() => () => cancelAnim(), [cancelAnim]);

  return { frameFrom, frameTo, blend, snapTo };
}
