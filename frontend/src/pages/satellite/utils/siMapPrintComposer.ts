import { approxGroundSpanMeters, pickScaleBarLength, type SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import type { SiMapPrintComposeInput } from './siMapPrintTypes';
import { siMapPrintAspectRatio } from './siMapPrintTypes';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const test = `${line} ${words[i]}`;
    if (ctx.measureText(test).width <= maxW) line = test;
    else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

/** Minimal inline legend — no heavy bar (cartographic standard). */
function drawCartographicLegendRow(
  ctx: CanvasRenderingContext2D,
  items: SiAoiLegendStripItem[],
  x: number,
  y: number,
  w: number,
  rowH: number,
) {
  if (!items.length) return;
  const maxItems = Math.min(items.length, 12);
  const slice = items.length > maxItems ? items.slice(0, maxItems - 1).concat([{ label: '…', color: '#cbd5e1' }]) : items;
  const sw = Math.max(10, Math.round(rowH * 0.55));
  let fontPx = Math.max(8, Math.round(rowH * 0.42));
  const gap = 8;
  const innerPad = 4;

  for (let attempt = 0; attempt < 8; attempt++) {
    ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    let tw = innerPad * 2;
    for (const it of slice) {
      tw += sw + 5 + ctx.measureText(it.label).width + gap;
    }
    if (tw <= w || fontPx <= 7) break;
    fontPx -= 1;
  }

  ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  let totalW = innerPad * 2;
  for (const it of slice) {
    totalW += sw + 5 + ctx.measureText(it.label).width + gap;
  }
  let cx = x + Math.max(0, (w - totalW) / 2);
  const cy = y + rowH / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (const it of slice) {
    ctx.fillStyle = it.color;
    ctx.fillRect(cx, cy - sw / 2, sw, sw);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.lineWidth = 0.75;
    ctx.strokeRect(cx + 0.5, cy - sw / 2 + 0.5, sw - 1, sw - 1);
    cx += sw + 5;
    ctx.fillStyle = '#475569';
    ctx.fillText(it.label, cx, cy);
    cx += ctx.measureText(it.label).width + gap;
  }
  ctx.textAlign = 'left';
}

/** Small, low-contrast north indicator on the map. */
function drawSubtleNorthArrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.55);
  ctx.lineTo(cx - r * 0.28, cy + r * 0.35);
  ctx.lineTo(cx + r * 0.28, cy + r * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.font = `600 ${Math.max(8, Math.round(size * 0.32))}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy + r * 0.08);
  ctx.restore();
}

/** Simple scale bar — whole numbers, thin line, no card. */
function drawSimpleScaleBar(
  ctx: CanvasRenderingContext2D,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  bounds: SiPdfLngLatBounds | null,
) {
  const pad = 14;
  const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
  const { meters, label } = pickScaleBarLength(visibleM);
  const barPx = Math.min(mapW * 0.22, Math.max(48, (meters / visibleM) * mapW * 0.75));
  const x0 = mapX + pad;
  const y0 = mapY + mapH - pad;

  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + barPx, y0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x0, y0 + 4);
  ctx.moveTo(x0 + barPx, y0 - 4);
  ctx.lineTo(x0 + barPx, y0 + 4);
  ctx.stroke();
  ctx.font = `500 ${Math.max(9, Math.round(mapW * 0.012))}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, x0 + barPx / 2, y0 - 6);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawAttributionBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  w: number,
  fontPx: number,
) {
  ctx.font = `400 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let cy = y;
  for (const line of lines.slice(0, 3)) {
    const rows = wrapLines(ctx, line, w);
    for (const row of rows) {
      ctx.fillText(row, x + w / 2, cy);
      cy += fontPx * 1.35;
    }
  }
  ctx.textAlign = 'left';
}

/**
 * Professional cartographic page layout: map-first, minimal surrounds, balanced whitespace.
 */
export async function composeSiMapPrintPage(input: SiMapPrintComposeInput): Promise<string> {
  const { mapPng, settings, legendItems, layerLines, mapLngLatBounds, metaLine } = input;
  const img = await loadImage(mapPng);
  const aspect = siMapPrintAspectRatio(settings);
  const baseW = settings.paper === 'A3' ? 3508 : 2480;
  const pageW = settings.orientation === 'landscape' ? baseW : Math.round(baseW / aspect);
  const pageH = Math.round(pageW / aspect);

  const margin = Math.round(pageW * 0.062);
  const contentW = pageW - margin * 2;

  const titleBlockH = settings.includeTitle ? Math.round(pageH * 0.11) : 0;
  const legendRowH =
    settings.includeLegend && legendItems.length > 0 ? Math.round(Math.min(36, pageH * 0.045)) : 0;
  const footerLines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) {
    footerLines.push(settings.description.trim());
  }
  const creditParts: string[] = [];
  if (metaLine?.trim() && !settings.includeTitle) creditParts.push(metaLine.trim());
  if (settings.includeLayerList && layerLines.length > 0) {
    creditParts.push(layerLines.slice(0, 4).join(' · '));
  }
  if (creditParts.length) footerLines.push(creditParts.join(' · '));
  footerLines.push('GeoSyntra · geospatial intelligence');
  const attrFontPx = Math.max(9, Math.round(pageW * 0.011));
  const attrH = footerLines.length ? Math.round(footerLines.length * attrFontPx * 1.45 + 8) : 0;

  let y = margin;
  const mapTop = margin + titleBlockH + (legendRowH > 0 ? legendRowH + Math.round(pageH * 0.012) : 0);
  const mapBottom = pageH - margin - attrH;
  const mapBoxH = Math.max(120, mapBottom - mapTop);
  const mapBoxW = contentW;

  const mapAspect = img.width / Math.max(1, img.height);
  let drawW = mapBoxW;
  let drawH = drawW / mapAspect;
  if (drawH > mapBoxH) {
    drawH = mapBoxH;
    drawW = drawH * mapAspect;
  }
  const mapX = margin + (mapBoxW - drawW) / 2;
  const mapY = mapTop + (mapBoxH - drawH) / 2;

  const c = document.createElement('canvas');
  c.width = pageW;
  c.height = pageH;
  const ctx = c.getContext('2d');
  if (!ctx) return mapPng;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  if (settings.includeTitle) {
    const title = (settings.title.trim() || 'Map export').replace(/\s+/g, ' ');
    const titlePx = Math.round(pageW * 0.034);
    const subPx = Math.round(pageW * 0.015);
    y = margin;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${titlePx}px "Segoe UI", system-ui, Georgia, serif`;
    const titleLines = wrapLines(ctx, title, contentW * 0.92);
    for (const line of titleLines.slice(0, 2)) {
      ctx.fillText(line, pageW / 2, y);
      y += titlePx * 1.15;
    }
    if (metaLine?.trim()) {
      ctx.font = `400 ${subPx}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = '#64748b';
      const subLines = wrapLines(ctx, metaLine.trim(), contentW * 0.88);
      for (const line of subLines.slice(0, 2)) {
        ctx.fillText(line, pageW / 2, y + 4);
        y += subPx * 1.35;
      }
    }
    ctx.textAlign = 'left';
  }

  if (legendRowH > 0 && legendItems.length > 0) {
    const ly = settings.includeTitle ? y + Math.round(pageH * 0.008) : margin;
    drawCartographicLegendRow(ctx, legendItems, margin, ly, contentW, legendRowH);
  }

  ctx.drawImage(img, mapX, mapY, drawW, drawH);

  if (settings.includeNorthArrow) {
    drawSubtleNorthArrow(ctx, mapX + 10, mapY + 10, 30);
  }
  if (settings.includeScale) {
    drawSimpleScaleBar(ctx, mapX, mapY, drawW, drawH, mapLngLatBounds);
  }

  if (attrH > 0) {
    drawAttributionBlock(ctx, footerLines, margin, pageH - margin - attrH + 4, contentW, attrFontPx);
  }

  if (settings.includeWatermark) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(pageW * 0.06)}px system-ui, sans-serif`;
    ctx.translate(pageW / 2, pageH * 0.52);
    ctx.rotate(-Math.PI / 8);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GeoSyntra', 0, 0);
    ctx.restore();
  }

  return c.toDataURL('image/png');
}
