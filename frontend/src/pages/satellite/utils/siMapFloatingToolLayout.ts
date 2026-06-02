/** Independent map tools that pop from the physical left edge and stack when several are open. */

export type SiMapFloatingToolId =
  | 'aoi-timeline-charts'
  | 'aoi-live-charts'
  | 'route-map'
  | 'spectral-legend';

export const SI_MAP_FLOAT_LEFT_PAD = 16;
export const SI_MAP_FLOAT_TOP_BASE = 88;

const STACK_ORDER: SiMapFloatingToolId[] = [
  'aoi-timeline-charts',
  'route-map',
  'spectral-legend',
  'aoi-live-charts',
];

/** Estimated panel height for vertical stacking (px). */
const EST_STACK_HEIGHT: Record<SiMapFloatingToolId, number> = {
  'aoi-timeline-charts': 440,
  'route-map': 300,
  'spectral-legend': 300,
  'aoi-live-charts': 400,
};

const STACK_GAP = 14;

export function computeFloatingToolOrigin(
  toolId: SiMapFloatingToolId,
  openToolIds: readonly SiMapFloatingToolId[],
): { left: number; top: number } {
  if (typeof window === 'undefined') {
    return { left: SI_MAP_FLOAT_LEFT_PAD, top: SI_MAP_FLOAT_TOP_BASE };
  }
  let top = SI_MAP_FLOAT_TOP_BASE;
  for (const id of STACK_ORDER) {
    if (id === toolId) break;
    if (openToolIds.includes(id)) top += EST_STACK_HEIGHT[id] + STACK_GAP;
  }
  return { left: SI_MAP_FLOAT_LEFT_PAD, top };
}

export function clampFixedPanelPosition(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  if (typeof window === 'undefined') return { left, top };
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(pad, Math.min(vw - pad - width, left)),
    top: Math.max(pad, Math.min(vh - pad - height, top)),
  };
}

/** Clamp drag translate for panels anchored with CSS `left` / `top` + transform. */
export function clampFloatingPanelTranslate(
  el: HTMLElement,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const margin = 10;
  const prev = el.style.transform;
  el.style.transform = `translate(${dx}px, ${dy}px)`;
  const r = el.getBoundingClientRect();
  el.style.transform = prev;
  let x = dx;
  let y = dy;
  if (r.left < margin) x += margin - r.left;
  if (r.top < margin) y += margin - r.top;
  if (r.right > window.innerWidth - margin) x -= r.right - (window.innerWidth - margin);
  if (r.bottom > window.innerHeight - margin) y -= r.bottom - (window.innerHeight - margin);
  return { x, y };
}
