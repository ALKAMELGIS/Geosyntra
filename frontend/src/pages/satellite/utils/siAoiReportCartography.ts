import type jsPDF from 'jspdf';
import {
  siAoiReportFeatureBBoxLngLat,
  siPdfBoundsFromFitBounds,
  type SiPdfLngLatBounds,
} from './siAoiReportGeo';
import type {
  SiAoiClassificationPalette,
  SiAoiReportCartographyInput,
  SiAoiReportTableRow,
} from './siAoiReportCartographyTypes';

export type { SiPdfLngLatBounds } from './siAoiReportGeo';
export { siPdfBoundsFromFitBounds } from './siAoiReportGeo';

function pdfSafeText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2248|\u2245/g, '~')
    .replace(/\u00b7/g, ', ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export function siPdfBoundsFromFeatureCollection(fc: GeoJSON.FeatureCollection): SiPdfLngLatBounds | null {
  const f = fc.features?.[0];
  if (!f) return null;
  const b = siAoiReportFeatureBBoxLngLat(f);
  if (!b) return null;
  return { west: b[0], south: b[1], east: b[2], north: b[3] };
}

export function approxGroundSpanMeters(b: SiPdfLngLatBounds): number {
  const midLatRad = ((b.south + b.north) / 2) * (Math.PI / 180);
  const mLat = 111_320 * Math.max(1e-9, b.north - b.south);
  const mLng = 111_320 * Math.max(0.05, Math.cos(midLatRad)) * Math.max(1e-9, b.east - b.west);
  return Math.max(mLat, mLng) * 0.92;
}

export function pickScaleBarLength(visibleM: number): { meters: number; label: string } {
  const raw = Math.max(visibleM / 4.5, 10);
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const n = raw / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  const meters = step * base;
  if (meters >= 1000) {
    const km = meters / 1000;
    const label = Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;
    return { meters, label };
  }
  return { meters, label: `${Math.round(meters)} m` };
}

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number) {
  const r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/** North arrow + scale bar on a captured map raster (preview / PNG composite). */
export function drawNorthArrowAndScaleOnMapCanvas(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  bounds: SiPdfLngLatBounds | null,
) {
  const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
  const { meters, label } = pickScaleBarLength(visibleM);
  const barPx = Math.min(mapW * 0.32, Math.max(64, (meters / visibleM) * mapW * 0.88));
  const pad = 11;
  const sbW = Math.min(barPx + 54, mapW - pad * 2);
  const sbH = 36;
  const yCard = mapH - pad - sbH;
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
  fillRoundRect(ctx, pad, yCard, sbW, sbH, 8);
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
  ctx.lineWidth = 2;
  const bx0 = pad + 10;
  const yLine = yCard + 14;
  ctx.beginPath();
  ctx.moveTo(bx0, yLine);
  ctx.lineTo(bx0 + barPx, yLine);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx0, yLine - 4);
  ctx.lineTo(bx0, yLine + 4);
  ctx.moveTo(bx0 + barPx, yLine - 4);
  ctx.lineTo(bx0 + barPx, yLine + 4);
  ctx.stroke();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '600 11px system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, bx0, yLine - 6);
  ctx.font = '500 9px system-ui, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
  ctx.fillText('Scale (approx.)', bx0, yCard + sbH - 7);

  const nx = pad + 23;
  const ny = pad + 34;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
  fillRoundRect(ctx, pad, pad, 46, 54, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(nx, ny - 18);
  ctx.lineTo(nx - 11, ny + 8);
  ctx.lineTo(nx + 11, ny + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.95)';
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.font = '700 12px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('N', nx, pad + 16);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function hexToRgbTriplet(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [34, 197, 94];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rowColor(row: SiAoiReportTableRow, pal: SiAoiClassificationPalette): string {
  return (
    row.colorHex ??
    (row.key === 'high' ? pal.high : row.key === 'medium' ? pal.medium : row.key === 'low' ? pal.low : '#94a3b8')
  );
}

/** Frosted map overlay panel (PDF vector). */
function pdfMapGlassPanel(doc: jsPDF, x: number, y: number, w: number, h: number, opacity = 0.86) {
  const GStateCtor = (doc as unknown as { GState?: new (opts: { opacity: number }) => unknown }).GState;
  if (GStateCtor) {
    doc.setGState(new GStateCtor({ opacity }) as never);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
    doc.setGState(new GStateCtor({ opacity: 1 }) as never);
  } else {
    doc.setFillColor(252, 252, 253);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
  }
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S');
}

function pdfMapHaloText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: { align?: 'left' | 'center' | 'right'; size: number; style?: 'normal' | 'bold'; rgb: [number, number, number] },
) {
  const align = opts.align ?? 'left';
  doc.setFont('helvetica', opts.style ?? 'normal');
  doc.setFontSize(opts.size);
  doc.setTextColor(255, 255, 255);
  const halo = 0.22;
  for (const [dx, dy] of [
    [halo, 0],
    [-halo, 0],
    [0, halo],
    [0, -halo],
  ]) {
    doc.text(text, x + dx, y + dy, { align });
  }
  doc.setTextColor(opts.rgb[0], opts.rgb[1], opts.rgb[2]);
  doc.text(text, x, y, { align });
}

/** Compact north arrow — vector only, no background card (Enterprise GIS). */
function drawPdfNorthArrow(doc: jsPDF, mapX: number, mapY: number) {
  const cx = mapX + 12;
  const tipY = mapY + 11;
  const baseY = tipY + 11;
  const halfW = 4.2;
  doc.setFillColor(30, 41, 59);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.triangle(cx, tipY, cx - halfW, baseY, cx + halfW, baseY, 'FD');
  pdfMapHaloText(doc, 'N', cx, tipY - 2.5, { align: 'center', size: 6.5, style: 'bold', rgb: [30, 41, 59] });
}

/** Compact scale bar — bottom-left, minimal glass strip. */
function drawPdfScaleBar(
  doc: jsPDF,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  bounds: SiPdfLngLatBounds | null,
) {
  const visibleM = bounds ? approxGroundSpanMeters(bounds) : Math.max(500, mapW * 3);
  const { meters, label } = pickScaleBarLength(visibleM);
  const barPx = Math.min(mapW * 0.22, Math.max(40, (meters / visibleM) * mapW * 0.72));
  const padX = 7;
  const padY = 6;
  const cardW = barPx + padX * 2;
  const cardH = 18;
  const cardX = mapX + 7;
  const cardY = mapY + mapH - cardH - 7;
  pdfMapGlassPanel(doc, cardX, cardY, cardW, cardH, 0.84);
  const bx0 = cardX + padX;
  const yLine = cardY + 10;
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.85);
  doc.line(bx0, yLine, bx0 + barPx, yLine);
  doc.setLineWidth(0.55);
  doc.line(bx0, yLine - 2.2, bx0, yLine + 2.2);
  doc.line(bx0 + barPx, yLine - 2.2, bx0 + barPx, yLine + 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(30, 41, 59);
  doc.text(pdfSafeText(label), bx0, yLine - 3.5);
}

/** Compact classification legend — bottom-right, frosted panel. */
function drawPdfMapLegendPanel(
  doc: jsPDF,
  report: SiAoiReportCartographyInput,
  panelX: number,
  panelBottomY: number,
  panelW: number,
) {
  const pal = report.classificationPalette;
  const rows = report.tableRows.slice(0, 8);
  const sw = 4;
  const lineH = 6.8;
  const pad = 5;
  const titleH = 8;
  const panelH = pad + titleH + rows.length * lineH + lineH + pad;
  const panelY = panelBottomY - panelH;
  pdfMapGlassPanel(doc, panelX, panelY, panelW, panelH, 0.86);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(30, 41, 59);
  doc.text(pdfSafeText(`${report.indexLabel}`), panelX + pad, panelY + pad + 4.5);

  let ly = panelY + pad + titleH + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  for (const row of rows) {
    const [R, G, B] = hexToRgbTriplet(rowColor(row, pal));
    doc.setFillColor(R, G, B);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.15);
    doc.roundedRect(panelX + pad, ly - sw + 0.5, sw, sw, 0.4, 0.4, 'FD');
    doc.setTextColor(51, 65, 85);
    const txt = pdfSafeText(`${row.labelEn} · ${row.pct.toFixed(1)}%`);
    const maxW = panelW - pad * 2 - sw - 3;
    const clipped =
      doc.getTextWidth(txt) > maxW
        ? `${txt.slice(0, Math.max(6, Math.floor(maxW / 2.8)))}…`
        : txt;
    doc.text(clipped, panelX + pad + sw + 2.5, ly);
    ly += lineH;
  }
  const [rA, gA, bA] = hexToRgbTriplet(pal.aoiOutline);
  doc.setFillColor(rA, gA, bA);
  doc.setDrawColor(100, 116, 139);
  doc.roundedRect(panelX + pad, ly - sw + 0.5, sw, sw, 0.4, 0.4, 'FD');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(4.8);
  doc.text('AOI outline', panelX + pad + sw + 2.5, ly);
}

/**
 * Cartographer layout on the embedded map frame: border, north arrow, scale, legend.
 * Drawn in PDF vector space so export always includes map elements.
 */
export function drawPdfCartographerMapLayout(
  doc: jsPDF,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  bounds: SiPdfLngLatBounds | null,
  report: SiAoiReportCartographyInput,
) {
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.75);
  doc.rect(mapX, mapY, mapW, mapH, 'S');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.rect(mapX + 1.5, mapY + 1.5, mapW - 3, mapH - 3, 'S');

  drawPdfNorthArrow(doc, mapX, mapY);
  drawPdfScaleBar(doc, mapX, mapY, mapW, mapH, bounds);

  const legendW = Math.min(102, Math.max(78, mapW * 0.26));
  drawPdfMapLegendPanel(doc, report, mapX + mapW - legendW - 7, mapY + mapH - 7, legendW);

  pdfMapHaloText(doc, 'WGS84', mapX + mapW - 7, mapY + 7, {
    align: 'right',
    size: 5,
    style: 'normal',
    rgb: [71, 85, 105],
  });
}
