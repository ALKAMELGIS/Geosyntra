import type jsPDF from 'jspdf';
import type {
  SiAoiClassificationPalette,
  SiAoiReportModel,
  SiAoiReportTableRow,
} from './siAoiVegetationReportModel';

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

function featureBBoxLngLat(geojson: GeoJSON.Feature): [number, number, number, number] | null {
  const points: [number, number][] = [];
  const walkCoords = (coords: unknown) => {
    if (!coords) return;
    const c = coords as unknown;
    if (typeof c === 'object' && c !== null && 'length' in c && typeof (c as number[])[0] === 'number') {
      const arr = c as number[];
      if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        points.push([arr[0], arr[1]]);
        return;
      }
    }
    if (Array.isArray(c)) c.forEach(walkCoords);
  };
  const g = geojson.geometry;
  if (!g) return null;
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    walkCoords((g as GeoJSON.Polygon).coordinates);
  }
  if (points.length === 0) return null;
  let [minX, minY] = points[0]!;
  let [maxX, maxY] = points[0]!;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export type SiPdfLngLatBounds = { west: number; south: number; east: number; north: number };

export function siPdfBoundsFromFeatureCollection(fc: GeoJSON.FeatureCollection): SiPdfLngLatBounds | null {
  const f = fc.features?.[0];
  if (!f) return null;
  const b = featureBBoxLngLat(f);
  if (!b) return null;
  return { west: b[0], south: b[1], east: b[2], north: b[3] };
}

export function siPdfBoundsFromFitBounds(fit: [[number, number], [number, number]]): SiPdfLngLatBounds {
  const lngs = [fit[0][0], fit[1][0]];
  const lats = [fit[0][1], fit[1][1]];
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
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

function drawPdfNorthArrow(doc: jsPDF, mapX: number, mapY: number) {
  const cardX = mapX + 10;
  const cardY = mapY + 10;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(cardX, cardY, 42, 50, 4, 4, 'F');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.roundedRect(cardX, cardY, 42, 50, 4, 4, 'S');
  const apexX = cardX + 21;
  const apexY = cardY + 16;
  doc.setFillColor(248, 250, 252);
  doc.triangle(apexX, apexY, apexX - 9, apexY + 24, apexX + 9, apexY + 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(226, 232, 240);
  doc.text('N', apexX, cardY + 14, { align: 'center' });
}

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
  const barPx = Math.min(mapW * 0.3, Math.max(52, (meters / visibleM) * mapW * 0.82));
  const cardW = barPx + 26;
  const cardH = 34;
  const cardX = mapX + 10;
  const cardY = mapY + mapH - cardH - 10;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'F');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.45);
  doc.roundedRect(cardX, cardY, cardW, cardH, 4, 4, 'S');
  const bx0 = cardX + 8;
  const yLine = cardY + 16;
  doc.setDrawColor(248, 250, 252);
  doc.setLineWidth(1.6);
  doc.line(bx0, yLine, bx0 + barPx, yLine);
  doc.setLineWidth(1);
  doc.line(bx0, yLine - 3, bx0, yLine + 3);
  doc.line(bx0 + barPx, yLine - 3, bx0 + barPx, yLine + 3);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(241, 245, 249);
  doc.text(pdfSafeText(label), bx0, yLine - 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  doc.text('Scale (approx.)', bx0, cardY + cardH - 6);
}

function drawPdfMapLegendPanel(
  doc: jsPDF,
  report: SiAoiReportModel,
  panelX: number,
  panelY: number,
  panelW: number,
) {
  const pal = report.classificationPalette;
  const rows = report.tableRows.slice(0, 8);
  const lineH = 11;
  const panelH = 16 + rows.length * lineH + 14;
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(panelX, panelY - panelH, panelW, panelH, 4, 4, 'F');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.45);
  doc.roundedRect(panelX, panelY - panelH, panelW, panelH, 4, 4, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(248, 250, 252);
  doc.text(pdfSafeText(`${report.indexLabel} legend`), panelX + 8, panelY - panelH + 11);
  let ly = panelY - panelH + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  for (const row of rows) {
    const [R, G, B] = hexToRgbTriplet(rowColor(row, pal));
    doc.setFillColor(R, G, B);
    doc.roundedRect(panelX + 8, ly - 5, 8, 8, 1, 1, 'F');
    doc.setTextColor(226, 232, 240);
    const txt = pdfSafeText(`${row.labelEn}  (${row.pct.toFixed(1)}%)`);
    const clipped =
      doc.getTextWidth(txt) > panelW - 28 ? `${txt.slice(0, Math.max(8, Math.floor((panelW - 28) / 4)))}…` : txt;
    doc.text(clipped, panelX + 20, ly);
    ly += lineH;
  }
  const [rA, gA, bA] = hexToRgbTriplet(pal.aoiOutline);
  doc.setFillColor(rA, gA, bA);
  doc.roundedRect(panelX + 8, ly - 5, 8, 8, 1, 1, 'F');
  doc.setTextColor(226, 232, 240);
  doc.text('AOI outline', panelX + 20, ly);
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
  report: SiAoiReportModel,
) {
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.25);
  doc.rect(mapX, mapY, mapW, mapH, 'S');
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.rect(mapX + 2.5, mapY + 2.5, mapW - 5, mapH - 5, 'S');

  drawPdfNorthArrow(doc, mapX, mapY);
  drawPdfScaleBar(doc, mapX, mapY, mapW, mapH, bounds);

  const legendW = Math.min(168, mapW * 0.42);
  drawPdfMapLegendPanel(doc, report, mapX + mapW - legendW - 10, mapY + mapH - 10, legendW);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(248, 250, 252);
  doc.text('WGS84 / Web Mercator snapshot', mapX + mapW - 8, mapY + 10, { align: 'right' });
}
