import { useLayoutEffect, type RefObject } from 'react';
import { clampPopupWithinRect } from '../utils/liveAoiPopupAnchor';

/** Keep map-anchored popup panels inside the map container bounds. */
export function useSiMapFeaturePopupClamp(
  popupRef: RefObject<HTMLElement | null>,
  mapContainerRef: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
): void {
  useLayoutEffect(() => {
    const el = popupRef.current;
    const container = mapContainerRef.current;
    if (!el || !container) return;

    const apply = () => {
      const er = el.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      const clamped = clampPopupWithinRect(
        er.left - cr.left,
        er.top - cr.top,
        er.width,
        er.height,
        cr.width,
        cr.height,
        10,
      );
      const dx = clamped.left - (er.left - cr.left);
      const dy = clamped.top - (er.top - cr.top);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        el.style.setProperty('--si-popup-clamp-x', `${dx}px`);
        el.style.setProperty('--si-popup-clamp-y', `${dy}px`);
      } else {
        el.style.setProperty('--si-popup-clamp-x', '0px');
        el.style.setProperty('--si-popup-clamp-y', '0px');
      }
    };

    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', apply);
    };
  }, deps);
}
