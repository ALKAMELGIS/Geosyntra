import type { SiMapPrintSettings } from './siMapPrintTypes';

/** One row in the print "Index / live layers" band (mirrors the map Layers panel). */
export type SiMapPrintLayerIndexRow = {
  label: string;
  detail: string;
  visible: boolean;
};

export function measureSiMapPrintLayerIndexBand(
  settings: SiMapPrintSettings,
  pageW: number,
  contentW: number,
  rows: SiMapPrintLayerIndexRow[],
): number {
  if (!settings.includeLayerList || rows.length === 0) return 0;
  const fontPx = Math.max(7, Math.round(pageW * 0.0082));
  const rowH = Math.round(fontPx * 1.55);
  const headerH = Math.round(pageW * 0.0095) + 10;
  const mc = document.createElement('canvas').getContext('2d')!;
  mc.font = `400 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  let extra = 0;
  for (const row of rows) {
    const line = `${row.label} — ${row.detail}`.trim();
    const wrapped = Math.max(1, Math.ceil(mc.measureText(line).width / (contentW * 0.94)));
    extra += (wrapped - 1) * Math.round(fontPx * 0.9);
  }
  return Math.min(headerH + rows.length * rowH + extra + 8, Math.round(pageW * 0.22));
}
