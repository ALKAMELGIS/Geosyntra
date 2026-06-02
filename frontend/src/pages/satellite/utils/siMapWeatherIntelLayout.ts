/** Layout for the weather intel panel inside `.si-map-container` / map canvas host. */

/** Match `.si-weather-panel` width (`min(264px, …)`). */
export const SI_WX_INTEL_PANEL_W = 264;
/** Slightly wider when temporal comparison (3 columns) is visible. */
export const SI_WX_INTEL_PANEL_W_HISTORY = 296;
export const SI_WX_INTEL_POPUP_GAP = 12;
export const SI_WX_INTEL_CTX_RAIL_W = 56;
export const SI_WX_INTEL_CTX_PANEL_MAX_W = 360;
export const SI_WX_INTEL_TIMELINE_BOTTOM_INSET = 88;
export const SI_WX_INTEL_ATTRIBUTION_BOTTOM = 48;
export const SI_WX_INTEL_TOP_PAD = 12;
export const SI_WX_INTEL_EDGE_PAD = 12;

export type SiMapWeatherIntelLayoutOpts = {
  historyOpen?: boolean;
  toolboxPanelOpen?: boolean;
  /** Extra px to reserve on the inline-start edge (floating chart stacks). */
  leftFloatingReserve?: number;
};

export type SiMapWeatherIntelLayout = {
  insetInlineStart: number;
  top: number;
  width: number;
  maxHeight: number;
  trailingReserve: number;
  shellW: number;
  shellH: number;
};

export type SiMapWeatherIntelPanelPos = { left: number; top: number };

export function isDocumentRtl(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}

/** Default absolute position inside the map shell overlay (LTR/RTL). */
export function weatherIntelDefaultPanelPosition(layout: SiMapWeatherIntelLayout): SiMapWeatherIntelPanelPos {
  if (isDocumentRtl()) {
    return {
      left: Math.max(
        8,
        layout.shellW - layout.trailingReserve - layout.width - layout.insetInlineStart,
      ),
      top: layout.top,
    };
  }
  return { left: layout.insetInlineStart, top: layout.top };
}

/** Keep floating panel inside map shell (respects trailing toolbox reserve). */
export function clampWeatherIntelPanelPosition(
  left: number,
  top: number,
  width: number,
  height: number,
  layout: SiMapWeatherIntelLayout,
): SiMapWeatherIntelPanelPos {
  const pad = 8;
  const minLeft = pad;
  const maxLeft = Math.max(pad, layout.shellW - layout.trailingReserve - pad - width);
  const minTop = pad;
  const maxTop = Math.max(pad, layout.shellH - pad - height);
  return {
    left: Math.max(minLeft, Math.min(maxLeft, left)),
    top: Math.max(minTop, Math.min(maxTop, top)),
  };
}

/** Reads `--si-map-bottom-reserve` from the document root (table dock, etc.). */
export function readSiMapBottomReservePx(): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--si-map-bottom-reserve').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function computeSiMapWeatherIntelLayout(
  shellW: number,
  shellH: number,
  opts: SiMapWeatherIntelLayoutOpts = {},
): SiMapWeatherIntelLayout {
  const pad = SI_WX_INTEL_EDGE_PAD;
  const top = SI_WX_INTEL_TOP_PAD;
  const leftExtra = Math.max(0, opts.leftFloatingReserve ?? 0);
  const insetInlineStart = pad + leftExtra;

  const trailingReserve = opts.toolboxPanelOpen
    ? Math.min(SI_WX_INTEL_CTX_PANEL_MAX_W, Math.round(shellW * 0.38))
    : SI_WX_INTEL_CTX_RAIL_W;

  const bottomReserve =
    readSiMapBottomReservePx() + SI_WX_INTEL_TIMELINE_BOTTOM_INSET + SI_WX_INTEL_ATTRIBUTION_BOTTOM;

  const preferredW = opts.historyOpen ? SI_WX_INTEL_PANEL_W_HISTORY : SI_WX_INTEL_PANEL_W;
  const maxW = Math.max(240, shellW - insetInlineStart - trailingReserve - pad);
  const width = Math.min(preferredW, maxW);

  const maxHeight = Math.max(140, Math.min(380, shellH - top - bottomReserve - pad));

  return {
    insetInlineStart,
    top,
    width,
    maxHeight,
    trailingReserve,
    shellW,
    shellH,
  };
}

export function weatherIntelLayoutToStyleVars(layout: SiMapWeatherIntelLayout): Record<string, string> {
  return {
    '--si-wx-intel-inset-inline-start': `${layout.insetInlineStart}px`,
    '--si-wx-intel-top': `${layout.top}px`,
    '--si-wx-intel-width': `${layout.width}px`,
    '--si-wx-intel-max-height': `${layout.maxHeight}px`,
    '--si-wx-intel-trailing-reserve': `${layout.trailingReserve}px`,
  };
}

type MapboxProjectMap = {
  project: (lngLat: [number, number]) => { x: number; y: number };
  getContainer?: () => HTMLElement;
};

/** Map lng/lat → px inside `.si-map-container` (for anchored popups). */
export function weatherIntelShellPointFromPin(
  lng: number,
  lat: number,
  map: MapboxProjectMap,
): { x: number; y: number } | null {
  const container = map.getContainer?.();
  if (!container) return null;
  const shell = container.closest('.si-map-container') as HTMLElement | null;
  if (!shell) return null;
  const pt = map.project([lng, lat]);
  const shellRect = shell.getBoundingClientRect();
  const mapRect = container.getBoundingClientRect();
  return {
    x: pt.x + mapRect.left - shellRect.left,
    y: pt.y + mapRect.top - shellRect.top,
  };
}

/** Place compact popup near the clicked map coordinate (above-left, flip when clipped). */
export function weatherIntelPanelPositionAtPin(
  lng: number,
  lat: number,
  map: MapboxProjectMap,
  layout: SiMapWeatherIntelLayout,
  panelWidth: number,
  panelHeight: number,
): SiMapWeatherIntelPanelPos {
  const pt = weatherIntelShellPointFromPin(lng, lat, map);
  if (!pt) return weatherIntelDefaultPanelPosition(layout);

  const gap = SI_WX_INTEL_POPUP_GAP;
  let left = pt.x + gap;
  let top = pt.y - panelHeight - gap;

  if (top < gap) {
    top = pt.y + gap + 10;
  }
  if (left + panelWidth > layout.shellW - layout.trailingReserve - gap) {
    left = pt.x - panelWidth - gap;
  }

  return clampWeatherIntelPanelPosition(left, top, panelWidth, panelHeight, layout);
}
