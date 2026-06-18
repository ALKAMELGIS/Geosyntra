/** Reference map zoom — user outline width (px) applies at this level. */
export const SI_SYM_OUTLINE_WIDTH_REF_ZOOM = 12;

const ZOOM_STOPS: ReadonlyArray<readonly [number, number]> = [
  [4, 0.35],
  [12, 1],
  [18, 1.85],
];

/** Screen-pixel scale for outline width at a given map zoom (matches Mapbox interpolate). */
export function siMapOutlineWidthZoomScale(mapZoom: number): number {
  const z = Number.isFinite(mapZoom) ? mapZoom : SI_SYM_OUTLINE_WIDTH_REF_ZOOM;
  if (z <= ZOOM_STOPS[0][0]) return ZOOM_STOPS[0][1];
  for (let i = 0; i < ZOOM_STOPS.length - 1; i += 1) {
    const [z0, s0] = ZOOM_STOPS[i];
    const [z1, s1] = ZOOM_STOPS[i + 1];
    if (z <= z1) {
      const t = (z - z0) / (z1 - z0);
      return s0 + t * (s1 - s0);
    }
  }
  return ZOOM_STOPS[ZOOM_STOPS.length - 1][1];
}

/** Preview / UI stroke thickness at the current map zoom. */
export function siMapOutlineWidthPreviewPx(widthPx: number, mapZoom = SI_SYM_OUTLINE_WIDTH_REF_ZOOM): number {
  const w = Number.isFinite(widthPx) ? widthPx : 1;
  return Math.max(0.25, Math.min(12, w * siMapOutlineWidthZoomScale(mapZoom)));
}

/** Mapbox zoom factor — multiply outline width expressions for zoom-aware strokes. */
export function siMapOutlineWidthZoomFactor(): unknown[] {
  return ['interpolate', ['linear'], ['zoom'], ...ZOOM_STOPS.flat()];
}

export function siMapOutlineWidthForZoom(widthPx: number): unknown[] {
  const w = Number.isFinite(widthPx) ? widthPx : 1;
  return ['*', w, siMapOutlineWidthZoomFactor()];
}

/** Wrap scalar or data-driven width with the same zoom ramp. */
export function siMapOutlineWidthExprForZoom(widthExpr: unknown): unknown[] {
  if (typeof widthExpr === 'number' && Number.isFinite(widthExpr)) {
    return siMapOutlineWidthForZoom(widthExpr);
  }
  return ['*', widthExpr, siMapOutlineWidthZoomFactor()];
}
