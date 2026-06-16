import { useCallback, useEffect, useRef, useState } from 'react';

export const LUXURY_TOOLBOX_HIDE_MS = 1500;
export const LUXURY_TOOLBOX_EDGE_PX = 32;

export type LuxuryToolboxPhase = 'hidden' | 'peek' | 'visible';

function isTrailingEdgePointer(clientX: number): boolean {
  const rtl =
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  return rtl ? clientX <= LUXURY_TOOLBOX_EDGE_PX : clientX >= window.innerWidth - LUXURY_TOOLBOX_EDGE_PX;
}

export const LUXURY_TOOLBOX_PIN_KEY = 'si-lux-toolbox-pinned';

export function useLuxuryToolboxDock(enabled: boolean) {
  const [pinned, setPinned] = useState(() => {
    if (!enabled || typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(LUXURY_TOOLBOX_PIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [phase, setPhase] = useState<LuxuryToolboxPhase>(() => {
    if (!enabled) return 'visible';
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem(LUXURY_TOOLBOX_PIN_KEY) === '1') return 'visible';
      } catch {
        /* ignore */
      }
    }
    return 'hidden';
  });
  const [edgeNear, setEdgeNear] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    if (!enabled) return;
    clearHideTimer();
    setPhase('visible');
  }, [clearHideTimer, enabled]);

  const scheduleHide = useCallback(() => {
    if (!enabled || pinned) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setPhase('peek');
      hideTimerRef.current = window.setTimeout(() => {
        setPhase('hidden');
      }, 280);
    }, LUXURY_TOOLBOX_HIDE_MS);
  }, [clearHideTimer, enabled, pinned]);

  const togglePin = useCallback(() => {
    setPinned(current => {
      const next = !current;
      try {
        window.localStorage.setItem(LUXURY_TOOLBOX_PIN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (next) {
        clearHideTimer();
        setPhase('visible');
      }
      return next;
    });
  }, [clearHideTimer]);

  useEffect(() => {
    if (!enabled) {
      setPhase('visible');
      setEdgeNear(false);
      return;
    }
    if (pinned) {
      clearHideTimer();
      setPhase('visible');
    }
    const onMove = (e: PointerEvent) => {
      const near = isTrailingEdgePointer(e.clientX);
      setEdgeNear(near);
      if (near) reveal();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [clearHideTimer, enabled, pinned, reveal]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return {
    dockRef,
    phase,
    edgeNear,
    pinned,
    togglePin,
    reveal,
    scheduleHide,
    onDockEnter: reveal,
    onDockLeave: scheduleHide,
    isHidden: enabled && !pinned && phase === 'hidden',
    isPeek: enabled && !pinned && phase === 'peek',
    isVisible: !enabled || pinned || phase === 'visible',
  };
}
