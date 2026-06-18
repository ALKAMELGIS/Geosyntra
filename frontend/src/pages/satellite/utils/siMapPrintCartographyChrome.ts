import { approxGroundSpanMeters, pickScaleBarLength, type SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiMapPrintRect } from './siMapPrintGlobeLocator';

const LUX_GOLD = '#b8954a';
const LUX_INK = '#0f172a';
const LUX_PANEL = 'rgba(255, 252, 245, 0.96)';
const LUX_PANEL_STROKE = 'rgba(184, 149, 74, 0.5)';

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

/** Cartographic north arrow (ring + filled pointer + N label). */
export function drawSiMapPrintNorthArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sizePx: number,
) {
  const r = sizePx * 0.42;
  ctx.save();
  ctx.fillStyle = LUX_PANEL;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LUX_PANEL_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();

  const tip = cy - r * 0.72;
  const base = cy + r * 0.42;
  ctx.fillStyle = LUX_INK;
  ctx.beginPath();
  ctx.moveTo(cx, tip);
  ctx.lineTo(cx - r * 0.38, base);
  ctx.lineTo(cx, base - r * 0.12);
  ctx.lineTo(cx + r * 0.38, base);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(cx, tip + r * 0.08);
  ctx.lineTo(cx - r * 0.14, base - r * 0.05);
  ctx.lineTo(cx + r * 0.14, base - r * 0.05);
  ctx.closePath();
  ctx.fill();

  const fontPx = Math.max(10, Math.round(sizePx * 0.22));
  ctx.font = `700 ${fontPx}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = LUX_GOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r * 0.05);
  ctx.restore();
}

/** Large alternating scale bar with label (print-optimized). */
export function drawSiMapPrintScaleBar(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  maxBarPx: number,
  bounds: SiPdfLngLatBounds | null,
  pageW: number,
) {
  const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
  const { meters, label } = pickScaleBarLength(visibleM);
  const barPx = Math.min(maxBarPx, Math.max(96, (meters / visibleM) * maxBarPx * 1.05));
  const barH = Math.max(7, Math.round(pageW * 0.0032));
  const fontLabel = Math.max(10, Math.round(pageW * 0.0105));
  const fontKicker = Math.max(8, Math.round(pageW * 0.0085));
  const by = y0 + fontKicker + 6;

  ctx.font = `600 ${fontKicker}px Georgia, serif`;
  ctx.fillStyle = LUX_GOLD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('SCALE', x0, by - 4);

  const seg = barPx / 4;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? LUX_INK : '#f8fafc';
    ctx.fillRect(x0 + seg * i, by, seg, barH);
  }
  ctx.strokeStyle = LUX_INK;
  ctx.lineWidth = 1.1;
  ctx.strokeRect(x0, by, barPx, barH);
  for (let i = 0; i <= 4; i++) {
    const tx = x0 + seg * i;
    ctx.beginPath();
    ctx.moveTo(tx, by - 3);
    ctx.lineTo(tx, by + barH + 3);
    ctx.stroke();
  }

  ctx.font = `600 ${fontLabel}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = LUX_INK;
  ctx.textBaseline = 'top';
  ctx.fillText(label, x0, by + barH + 5);
  ctx.font = `500 ${Math.max(8, fontKicker - 1)}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = '#64748b';
  ctx.fillText('Approx. ground distance', x0, by + barH + 5 + fontLabel * 1.05);
}

/** Scale + north card drawn inside the map frame (bottom-right). */
export function drawSiMapPrintScaleNorthOverlay(
  ctx: CanvasRenderingContext2D,
  rect: SiMapPrintRect,
  bounds: SiPdfLngLatBounds | null,
  includeScale: boolean,
  includeNorth: boolean,
  pageW: number,
) {
  if (!includeScale && !includeNorth) return;
  ctx.save();
  ctx.fillStyle = LUX_PANEL;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.strokeStyle = LUX_PANEL_STROKE;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const northSize = Math.min(rect.h * 0.85, 52);
  if (includeNorth) {
    drawSiMapPrintNorthArrow(ctx, rect.x + rect.w - northSize * 0.55, rect.y + rect.h / 2, northSize);
  }
  if (includeScale) {
    const scaleX = rect.x + 12;
    const scaleW = includeNorth ? rect.w - northSize - 20 : rect.w - 24;
    drawSiMapPrintScaleBar(ctx, scaleX, rect.y + 8, scaleW, bounds, pageW);
  }
  ctx.restore();
}
