import type { jsPDF } from 'jspdf';

export type AgHealthPieSliceLike = { label: string; pct: number; color: string };

/** Pick evenly spaced timeline indices for X-axis labels (max ~8). */
export function pickTimelineLabelIndices(count: number, maxLabels = 8): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < maxLabels; i += 1) {
    out.push(Math.round((i / (maxLabels - 1)) * (count - 1)));
  }
  return out;
}

export function formatTimelineAxisDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (d.length < 10) return d;
  return d.slice(5);
}

/** Closed donut-slice polygon (outer arc → inner arc) — one fill per slice, no radial seams. */
export function donutSlicePolygonPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  a0: number,
  a1: number,
  steps = 36,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + outerR * Math.cos(t), cy + outerR * Math.sin(t)]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const t = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + innerR * Math.cos(t), cy + innerR * Math.sin(t)]);
  }
  return pts;
}

export function svgDonutSlicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  a0: number,
  a1: number,
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x1o = cx + outerR * Math.cos(a0);
  const y1o = cy + outerR * Math.sin(a0);
  const x2o = cx + outerR * Math.cos(a1);
  const y2o = cy + outerR * Math.sin(a1);
  const x1i = cx + innerR * Math.cos(a0);
  const y1i = cy + innerR * Math.sin(a0);
  const x2i = cx + innerR * Math.cos(a1);
  const y2i = cy + innerR * Math.sin(a1);
  return [
    `M ${x1o} ${y1o}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x1i} ${y1i}`,
    'Z',
  ].join(' ');
}

function hexToRgbTriplet(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Fill a closed polygon on jsPDF (vector, no triangle-fan artifacts). */
export function fillPdfPolygon(doc: jsPDF, pts: [number, number][], fillRgb: [number, number, number]): void {
  if (pts.length < 3) return;
  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
  const [x0, y0] = pts[0]!;
  const deltas: [number, number][] = [];
  let px = x0;
  let py = y0;
  for (let i = 1; i < pts.length; i += 1) {
    const [x, y] = pts[i]!;
    deltas.push([x - px, y - py]);
    px = x;
    py = y;
  }
  deltas.push([x0 - px, y0 - py]);
  doc.lines(deltas, x0, y0, [1, 1], 'F', true);
}

export function drawPdfDonutSlices(
  doc: jsPDF,
  slices: AgHealthPieSliceLike[],
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): void {
  const total = slices.reduce((a, s) => a + Math.max(0, s.pct), 0) || 1;
  let ang = -Math.PI / 2;
  for (const s of slices) {
    const sweep = (Math.max(0, s.pct) / total) * Math.PI * 2;
    if (sweep <= 1e-6) continue;
    const a1 = ang + sweep;
    fillPdfPolygon(
      doc,
      donutSlicePolygonPoints(cx, cy, outerR, innerR, ang, a1),
      hexToRgbTriplet(s.color),
    );
    ang = a1;
  }
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, innerR, 'FD');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, outerR, 'S');
}

export function drawPdfTimelineXLabels(
  doc: jsPDF,
  dates: string[],
  px: (i: number) => number,
  y: number,
  innerX: number,
  innerW: number,
  maxLabels = 8,
): void {
  const indices = pickTimelineLabelIndices(dates.length, maxLabels);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.setTextColor(100, 116, 139);
  for (const idx of indices) {
    const lab = formatTimelineAxisDate(dates[idx] ?? '');
    const tx = px(idx);
    const lx = Math.min(innerX + innerW - 22, Math.max(innerX, tx - 10));
    doc.text(lab, lx, y, { align: idx === 0 ? 'left' : idx === dates.length - 1 ? 'right' : 'center' });
  }
}
