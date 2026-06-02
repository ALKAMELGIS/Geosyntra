/** Shared layout for independent map popouts (AOI charts, Route Map, Legend). */

export type SiMapLeftPopoutSlot =
  | 'route-map'
  | 'aoi-timeline'
  | 'spectral-legend'
  | 'weather'
  | 'crop-health'
  | 'layer-swipe';

export type MapCanvasLayout = {
  mapR: DOMRect;
  /** Width of the contextual tools dock on the trailing map edge. */
  dockW: number;
};

export function readMapCanvasLayout(): MapCanvasLayout | null {
  const mapEl = document.querySelector('.si-map-container');
  if (!(mapEl instanceof HTMLElement)) return null;
  const mapR = mapEl.getBoundingClientRect();
  const dock = mapEl.querySelector('.si-sat-ctx-dock--map');
  const dockW = dock instanceof HTMLElement ? dock.getBoundingClientRect().width : 0;
  return { mapR, dockW };
}

const SLOT_TOP_BIAS: Record<SiMapLeftPopoutSlot, number> = {
  'route-map': 0.06,
  'weather': 0.16,
  'crop-health': 0.24,
  'layer-swipe': 0.28,
  'aoi-timeline': 0.34,
  'spectral-legend': 0.58,
};

/** Physical left-edge origin inside the map canvas (LTR); RTL mirrors to trailing edge. */
export function siMapLeftPopoutFixedPosition(
  slot: SiMapLeftPopoutSlot,
  panelHeight = 400,
): { left: number; top: number } {
  const pad = 16;
  const layout = readMapCanvasLayout();
  if (!layout) {
    return { left: pad, top: 88 + SLOT_TOP_BIAS[slot] * 240 };
  }
  const { mapR, dockW } = layout;
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const availH = Math.max(120, mapR.height - pad * 2 - panelHeight);
  const top = mapR.top + pad + availH * SLOT_TOP_BIAS[slot];
  if (rtl) {
    const left = mapR.right - dockW - pad - 320;
    return { left: Math.max(mapR.left + pad, left), top };
  }
  return { left: mapR.left + pad, top };
}

/** North (top) edge of map canvas — default for 3D terrain popout. */
export function siMapNorthPopoutFixedPosition(
  panelWidth = 248,
  panelHeight = 380,
  horizontalAlign: 'start' | 'center' = 'start',
): { left: number; top: number } {
  const pad = 16;
  const topPad = 12;
  const layout = readMapCanvasLayout();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  if (!layout) {
    if (typeof window === 'undefined') return { left: pad, top: topPad };
    const left =
      horizontalAlign === 'center'
        ? Math.max(pad, (window.innerWidth - panelWidth) / 2)
        : pad;
    return { left, top: Math.max(topPad, 72) };
  }
  const { mapR, dockW } = layout;
  const minLeft = mapR.left + pad + (rtl ? dockW : 0);
  const maxLeft = mapR.right - (rtl ? 0 : dockW) - pad - panelWidth;
  const left =
    horizontalAlign === 'center'
      ? minLeft + Math.max(0, (maxLeft - minLeft) / 2)
      : minLeft;
  const top = mapR.top + topPad;
  return {
    left: Math.max(minLeft, Math.min(maxLeft, left)),
    top: Math.max(mapR.top + topPad, top),
  };
}

/** Right edge of map canvas — default for 3D terrain / analysis popouts (visual trailing side). */
export function siMapRightPopoutFixedPosition(
  panelWidth = 260,
  panelHeight = 320,
  topBias = 0.08,
): { left: number; top: number } {
  const pad = 24;
  const layout = readMapCanvasLayout();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  if (!layout) {
    if (typeof window === 'undefined') return { left: pad, top: 88 };
    return {
      left: Math.max(pad, window.innerWidth - panelWidth - pad),
      top: Math.max(pad, 88),
    };
  }
  const { mapR, dockW } = layout;
  // LTR: toolbox on physical right — sit left of the rail. RTL: toolbox on physical left — hug visual right.
  const trailingInset = pad + (rtl ? 0 : dockW);
  const minLeft = mapR.left + pad + (rtl ? dockW : 0);
  const left = Math.max(minLeft, mapR.right - trailingInset - panelWidth);
  const availH = Math.max(120, mapR.height - pad * 2 - panelHeight);
  const top = mapR.top + pad + availH * topBias;
  return {
    left,
    top: Math.max(mapR.top + pad, top),
  };
}

/** @deprecated Prefer siMapRightPopoutFixedPosition for terrain-style panels. */
export function siMapLeftPopoutCenterFixedPosition(
  panelWidth = 260,
  panelHeight = 320,
): { left: number; top: number } {
  const pad = 16;
  const layout = readMapCanvasLayout();
  if (!layout) {
    if (typeof window === 'undefined') return { left: pad, top: 88 };
    return {
      left: pad,
      top: Math.max(pad, (window.innerHeight - panelHeight) / 2),
    };
  }
  const { mapR } = layout;
  const top = mapR.top + Math.max(pad, (mapR.height - panelHeight) / 2);
  return { left: mapR.left + pad, top };
}

/** Clamp absolute-positioned panel inside map canvas (for `.si-map-container` children). */
export function clampAbsolutePanelInMapCanvas(
  el: HTMLElement,
  left: number,
  top: number,
): { left: number; top: number } {
  const margin = 10;
  const layout = readMapCanvasLayout();
  if (!layout) return { left, top };
  const { mapR, dockW } = layout;
  const w = el.offsetWidth || 320;
  const h = el.offsetHeight || 400;
  let nl = left;
  let nt = top;
  if (nl < margin) nl = margin;
  if (nt < margin) nt = margin;
  if (nl + w > mapR.width - dockW - margin) nl = Math.max(margin, mapR.width - dockW - margin - w);
  if (nt + h > mapR.height - margin) nt = Math.max(margin, mapR.height - margin - h);
  return { left: nl, top: nt };
}

/** Clamp translate drag for absolute panel anchored with `left` + `top` in map container. */
export function clampMapCanvasPanelTranslate(
  el: HTMLElement,
  translateX: number,
  translateY: number,
): { x: number; y: number } {
  const margin = 10;
  const prev = el.style.transform;
  el.style.transform = `translate(${translateX}px, ${translateY}px)`;
  const r = el.getBoundingClientRect();
  el.style.transform = prev;
  let nx = translateX;
  let ny = translateY;
  const layout = readMapCanvasLayout();
  if (layout) {
    const { mapR, dockW } = layout;
    if (r.left < mapR.left + margin) nx += mapR.left + margin - r.left;
    if (r.top < mapR.top + margin) ny += mapR.top + margin - r.top;
    if (r.right > mapR.right - dockW - margin) nx -= r.right - (mapR.right - dockW - margin);
    if (r.bottom > mapR.bottom - margin) ny -= r.bottom - (mapR.bottom - margin);
    return { x: nx, y: ny };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (r.left < margin) nx += margin - r.left;
  if (r.top < margin) ny += margin - r.top;
  if (r.right > vw - margin) nx -= r.right - (vw - margin);
  if (r.bottom > vh - margin) ny -= r.bottom - (vh - margin);
  return { x: nx, y: ny };
}

/** Drag offset for fixed left-docked legend (positive X moves right into the map). */
export function clampLeftDockLegendOffset(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxX = Math.min(320, vw * 0.45);
  const maxY = Math.min(360, vh * 0.45);
  return {
    x: Math.max(0, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

/** True when a fixed panel fits inside the map canvas (respecting trailing dock). */
export function isFixedPanelInMapCanvas(
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  const pad = 12;
  const layout = readMapCanvasLayout();
  if (!layout) return false;
  const { mapR, dockW } = layout;
  return (
    left >= mapR.left + pad &&
    top >= mapR.top + pad &&
    left + width <= mapR.right - dockW - pad &&
    top + height <= mapR.bottom - pad
  );
}

/** Clamp fixed `left`/`top` panel inside the viewport / map. */
export function clampFixedPanelPosition(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  if (typeof window === 'undefined') return { left, top };
  const pad = 12;
  const layout = readMapCanvasLayout();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const minLeft = layout ? layout.mapR.left + pad + (rtl ? layout.dockW : 0) : pad;
  const maxLeft = layout
    ? layout.mapR.right - (rtl ? 0 : layout.dockW) - pad - width
    : window.innerWidth - pad - width;
  const minTop = layout ? layout.mapR.top + pad : pad;
  const maxTop = layout
    ? layout.mapR.bottom - pad - height
    : window.innerHeight - pad - height;
  return {
    left: Math.max(minLeft, Math.min(maxLeft, left)),
    top: Math.max(minTop, Math.min(maxTop, top)),
  };
}
