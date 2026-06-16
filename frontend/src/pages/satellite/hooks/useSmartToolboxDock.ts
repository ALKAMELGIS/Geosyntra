import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_DELAY_MS = 520;
const PEEK_ZONE_PX = 28;

export type SmartToolboxDockPhase = 'hidden' | 'peek' | 'visible';

export function useSmartToolboxDock(enabled: boolean) {
  const [phase, setPhase] = useState<SmartToolboxDockPhase>(enabled ? 'peek' : 'visible');
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
    if (!enabled) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setPhase(prev => (prev === 'visible' ? 'peek' : prev));
      hideTimerRef.current = window.setTimeout(() => {
        setPhase('hidden');
      }, HIDE_DELAY_MS);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer, enabled]);

  const onDockEnter = useCallback(() => reveal(), [reveal]);
  const onDockLeave = useCallback(() => scheduleHide(), [scheduleHide]);

  useEffect(() => {
    if (!enabled) {
      setPhase('visible');
      return;
    }
    const onMove = (e: PointerEvent) => {
      const rtl =
        typeof document !== 'undefined' &&
        document.documentElement.dir === 'rtl';
      const x = e.clientX;
      const edge = rtl ? x <= PEEK_ZONE_PX : x >= window.innerWidth - PEEK_ZONE_PX;
      if (edge) reveal();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [enabled, reveal]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return {
    dockRef,
    phase,
    reveal,
    scheduleHide,
    onDockEnter,
    onDockLeave,
    isHidden: enabled && phase === 'hidden',
    isPeek: enabled && phase === 'peek',
    isVisible: !enabled || phase === 'visible',
  };
}
