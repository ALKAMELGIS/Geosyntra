/** Attribute table bottom dock — width / height presets (ArcGIS-style, compact luxury). */

export const SI_TABLE_DOCK_WIDTH_PX = 920;
export const SI_TABLE_DOCK_WIDTH_VW = 0.72;

export function siTableDockWidthCss(): string {
  return `min(${SI_TABLE_DOCK_WIDTH_PX}px, ${Math.round(SI_TABLE_DOCK_WIDTH_VW * 100)}vw)`;
}

export function siTableDockHeightMinPx(): number {
  if (typeof window === 'undefined') return 140;
  return Math.max(128, Math.round(window.innerHeight * 0.12));
}

export function siTableDockHeightMaxPx(): number {
  if (typeof window === 'undefined') return 520;
  return Math.max(220, Math.round(window.innerHeight * 0.62));
}

export function siTableDockHeightQuarterPx(): number {
  if (typeof window === 'undefined') return 220;
  return Math.max(160, Math.round(window.innerHeight * 0.22));
}

export function siTableDockHeightCompactPx(): number {
  if (typeof window === 'undefined') return 180;
  return Math.max(140, Math.round(window.innerHeight * 0.16));
}

export function siTableDockHeightHalfPx(): number {
  if (typeof window === 'undefined') return 360;
  return Math.max(200, Math.round(window.innerHeight * 0.48));
}

/** Default Attribute table open size — ½ screen preset. */
export function siTableDockHeightDefaultPx(): number {
  return siTableDockHeightHalfPx();
}

export function clampSiTableDockHeightPx(h: number): number {
  return Math.max(siTableDockHeightMinPx(), Math.min(siTableDockHeightMaxPx(), Math.round(h)));
}
