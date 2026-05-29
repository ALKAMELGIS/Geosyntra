import { approxGroundSpanMeters, pickScaleBarLength, type SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import { computeSiMapPrintLayout, type SiMapPrintLayoutPlan, type SiMapPrintRect } from './siMapPrintLayout';
import type { SiMapPrintComposeInput } from './siMapPrintTypes';

const LUX_GOLD = '#b8954a';
const LUX_GOLD_LIGHT = '#d4bc7a';
const LUX_INK = '#0f172a';
const LUX_SLATE = '#475569';
const LUX_PANEL = 'rgba(255, 252, 245, 0.96)';
const LUX_PANEL_STROKE = 'rgba(184, 149, 74, 0.5)';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
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

function fitMapInFrame(
  imgW: number,
  imgH: number,
  frame: SiMapPrintRect,
  cover: boolean,
): { drawW: number; drawH: number; mapX: number; mapY: number } {
  const mapAspect = imgW / Math.max(1, imgH);
  if (cover) {
    let drawW = frame.w;
    let drawH = drawW / mapAspect;
    if (drawH < frame.h) {
      drawH = frame.h;
      drawW = drawH * mapAspect;
    }
    return { drawW, drawH, mapX: frame.x + (frame.w - drawW) / 2, mapY: frame.y + (frame.h - drawH) / 2 };
  }
  let drawW = frame.w;
  let drawH = drawW / mapAspect;
  if (drawH > frame.h) {
    drawH = frame.h;
    drawW = drawH * mapAspect;
  }
  return { drawW, drawH, mapX: frame.x + (frame.w - drawW) / 2, mapY: frame.y + (frame.h - drawH) / 2 };
}

function drawLuxuryMapFrame(ctx: CanvasRenderingContext2D, frame: SiMapPrintRect) {
  const { x, y, w, h } = frame;
  ctx.save();
  ctx.fillStyle = '#f8f6f1';
  fillRoundRect(ctx, x - 2, y - 2, w + 4, h + 4, 6);
  ctx.strokeStyle = LUX_GOLD;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.lineWidth = 0.75;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.restore();
}

function drawCompactTitle(ctx: CanvasRenderingContext2D, plan: SiMapPrintLayoutPlan, title: string, metaLine?: string) {
  if (!plan.title) return;
  const titlePx = Math.round(plan.pageW * 0.0135);
  const subPx = Math.round(plan.pageW * 0.0088);
  let y = plan.title.y + 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = LUX_INK;
  ctx.font = `600 ${titlePx}px Georgia, "Times New Roman", serif`;
  for (const line of wrapLines(ctx, title, plan.title.w * 0.9).slice(0, 2)) {
    ctx.fillText(line, plan.pageW / 2, y);
    y += titlePx * 1.05;
  }
  const ruleY = y + 2;
  const half = plan.title.w * 0.18;
  const cx = plan.pageW / 2;
  const grad = ctx.createLinearGradient(cx - half, ruleY, cx + half, ruleY);
  grad.addColorStop(0, 'rgba(184, 149, 74, 0)');
  grad.addColorStop(0.4, LUX_GOLD);
  grad.addColorStop(0.6, LUX_GOLD_LIGHT);
  grad.addColorStop(1, 'rgba(184, 149, 74, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - half, ruleY);
  ctx.lineTo(cx + half, ruleY);
  ctx.stroke();
  if (metaLine?.trim()) {
    y = ruleY + 6;
    ctx.font = `400 ${subPx}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = LUX_SLATE;
    for (const line of wrapLines(ctx, metaLine.trim(), plan.title.w * 0.86).slice(0, 2)) {
      ctx.fillText(line, plan.pageW / 2, y);
      y += subPx * 1.2;
    }
  }
  ctx.textAlign = 'left';
}

function drawFooterLegend(
  ctx: CanvasRenderingContext2D,
  items: SiAoiLegendStripItem[],
  rect: SiMapPrintRect,
  flow: 'horizontal' | 'vertical',
  pageW: number,
) {
  if (!items.length) return;
  ctx.save();
  ctx.fillStyle = LUX_PANEL;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
  ctx.strokeStyle = LUX_PANEL_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const kickerPx = Math.max(7, Math.round(pageW * 0.0075));
  ctx.font = `600 ${kickerPx}px Georgia, serif`;
  ctx.fillStyle = LUX_GOLD;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('KEY', rect.x + 10, rect.y + 6);

  const slice = items.slice(0, flow === 'vertical' ? 12 : 10);
  const innerX = rect.x + 10;
  const innerY = rect.y + kickerPx + 10;
  const innerW = rect.w - 20;
  const innerH = rect.h - kickerPx - 14;

  if (flow === 'horizontal') {
    const sw = Math.max(10, Math.round(innerH * 0.42));
    let fontPx = Math.max(8, Math.round(pageW * 0.0085));
    const gap = 10;
    for (let attempt = 0; attempt < 6; attempt++) {
      ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
      let tw = 0;
      for (const it of slice) tw += sw + 6 + ctx.measureText(it.label).width + gap;
      if (tw <= innerW || fontPx <= 7) break;
      fontPx -= 1;
    }
    let cx = innerX + Math.max(0, (innerW - slice.reduce((s, it) => s + sw + 6 + ctx.measureText(it.label).width + 10, 0)) / 2);
    const cy = innerY + innerH / 2;
    ctx.textBaseline = 'middle';
    for (const it of slice) {
      ctx.fillStyle = it.color;
      fillRoundRect(ctx, cx, cy - sw / 2, sw, sw, 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(cx + 0.5, cy - sw / 2 + 0.5, sw - 1, sw - 1);
      cx += sw + 6;
      ctx.fillStyle = LUX_INK;
      ctx.fillText(it.label, cx, cy);
      cx += ctx.measureText(it.label).width + 10;
    }
  } else {
    const colW = innerW / 2 - 6;
    const sw = 9;
    const rowH = Math.min(16, innerH / Math.ceil(slice.length / 2));
    let fontPx = Math.max(7, Math.round(rowH * 0.48));
    ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    slice.forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = innerX + col * (colW + 12);
      const y = innerY + row * rowH + rowH / 2;
      ctx.fillStyle = it.color;
      fillRoundRect(ctx, x, y - sw / 2, sw, sw, 2);
      ctx.fillStyle = LUX_INK;
      const label = it.label.length > 22 ? `${it.label.slice(0, 20)}…` : it.label;
      ctx.fillText(label, x + sw + 5, y);
    });
  }
  ctx.restore();
}

function drawFooterScaleNorth(
  ctx: CanvasRenderingContext2D,
  rect: SiMapPrintRect,
  bounds: SiPdfLngLatBounds | null,
  includeScale: boolean,
  includeNorth: boolean,
  pageW: number,
) {
  if (!includeScale && !includeNorth) return;
  const cardH = rect.h - 4;
  const cardY = rect.y + 2;
  const cardW = Math.min(rect.w - 4, Math.round(pageW * 0.42));
  const cardX = rect.x + rect.w - cardW - 2;

  ctx.save();
  ctx.fillStyle = LUX_PANEL;
  fillRoundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.strokeStyle = LUX_PANEL_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const northX = cardX + cardW - 22;
  const northY = cardY + cardH / 2;

  if (includeNorth) {
    const r = 11;
    ctx.fillStyle = LUX_INK;
    ctx.beginPath();
    ctx.moveTo(northX, northY - r * 0.65);
    ctx.lineTo(northX - r * 0.36, northY + r * 0.38);
    ctx.lineTo(northX + r * 0.36, northY + r * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 8px Georgia, serif`;
    ctx.fillStyle = LUX_GOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', northX, northY + 1);
  }

  if (includeScale) {
    const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
    const { meters, label } = pickScaleBarLength(visibleM);
    const barPx = Math.min(cardW - 48, 120);
    const bx0 = cardX + 10;
    const by = cardY + cardH / 2 + 2;

    ctx.font = `600 7px Georgia, serif`;
    ctx.fillStyle = LUX_GOLD;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SCALE', bx0, by - 8);

    const seg = barPx / 4;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? LUX_INK : '#f8fafc';
      ctx.fillRect(bx0 + seg * i, by - 2, seg, 4);
    }
    ctx.strokeStyle = LUX_INK;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(bx0, by - 2, barPx, 4);

    ctx.font = `600 8px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = LUX_INK;
    ctx.textBaseline = 'top';
    ctx.fillText(label, bx0, by + 5);
  }
  ctx.restore();
}

function drawLocatorInset(
  ctx: CanvasRenderingContext2D,
  bounds: SiPdfLngLatBounds | null,
  rect: SiMapPrintRect,
) {
  ctx.save();
  ctx.fillStyle = LUX_PANEL;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
  ctx.strokeStyle = LUX_PANEL_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();
  const pad = 6;
  const innerX = rect.x + pad;
  const innerY = rect.y + pad;
  const innerW = rect.w - pad * 2;
  const innerH = rect.h - pad - 12;
  ctx.fillStyle = '#e8e4dc';
  fillRoundRect(ctx, innerX, innerY, innerW, innerH, 3);
  if (bounds) {
    const lngSpan = Math.max(1e-6, bounds.east - bounds.west);
    const latSpan = Math.max(1e-6, bounds.north - bounds.south);
    const ctxLng = (bounds.west + bounds.east) / 2;
    const ctxLat = (bounds.south + bounds.north) / 2;
    const regionLng = lngSpan * 2.8;
    const regionLat = latSpan * 2.8;
    const rWest = ctxLng - regionLng / 2;
    const rEast = ctxLng + regionLng / 2;
    const rSouth = ctxLat - regionLat / 2;
    const rNorth = ctxLat + regionLat / 2;
    const toX = (lng: number) => innerX + ((lng - rWest) / (rEast - rWest)) * innerW;
    const toY = (lat: number) => innerY + innerH - ((lat - rSouth) / (rNorth - rSouth)) * innerH;
    const ax0 = toX(bounds.west);
    const ax1 = toX(bounds.east);
    const ay0 = toY(bounds.south);
    const ay1 = toY(bounds.north);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.32)';
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 1.2;
    ctx.fillRect(ax0, ay1, ax1 - ax0, ay0 - ay1);
    ctx.strokeRect(ax0 + 0.5, ay1 + 0.5, ax1 - ax0 - 1, ay0 - ay1 - 1);
  }
  ctx.font = `600 7px Georgia, serif`;
  ctx.fillStyle = LUX_SLATE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Locator', rect.x + rect.w / 2, rect.y + rect.h - 3);
  ctx.restore();
}

function drawCredits(ctx: CanvasRenderingContext2D, lines: string[], rect: SiMapPrintRect, pageW: number) {
  const fontPx = Math.max(8, Math.round(pageW * 0.0088));
  ctx.font = `400 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = LUX_SLATE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cy = rect.y;
  for (const line of lines.slice(0, 4)) {
    for (const row of wrapLines(ctx, line, rect.w)) {
      ctx.fillText(row, rect.x, cy);
      cy += fontPx * 1.28;
    }
  }
}

/**
 * Cartographic layout: compact title, map frame, legend + scale/north in footer bands (no overlap).
 */
export async function composeSiMapPrintPage(input: SiMapPrintComposeInput): Promise<string> {
  const { mapPng, settings, legendItems, layerLines, mapLngLatBounds, metaLine } = input;
  const img = await loadImage(mapPng);
  const plan = computeSiMapPrintLayout({
    settings,
    legendItems: settings.includeLegend ? legendItems : [],
    layerLines: settings.includeLayerList ? layerLines : [],
    metaLine,
  });

  const fit = fitMapInFrame(img.width, img.height, plan.mapFrame, settings.fitMapOnPaper);
  const c = document.createElement('canvas');
  c.width = plan.pageW;
  c.height = plan.pageH;
  const ctx = c.getContext('2d');
  if (!ctx) return mapPng;

  ctx.fillStyle = '#fffefb';
  ctx.fillRect(0, 0, plan.pageW, plan.pageH);

  const title = (settings.title.trim() || 'Map export').replace(/\s+/g, ' ');
  if (settings.includeTitle) drawCompactTitle(ctx, plan, title, metaLine);

  drawLuxuryMapFrame(ctx, plan.mapFrame);
  ctx.save();
  ctx.beginPath();
  ctx.rect(plan.mapFrame.x + 5, plan.mapFrame.y + 5, plan.mapFrame.w - 10, plan.mapFrame.h - 10);
  ctx.clip();
  ctx.drawImage(img, fit.mapX, fit.mapY, fit.drawW, fit.drawH);
  ctx.restore();

  if (plan.locator && settings.includeLocator) {
    drawLocatorInset(ctx, mapLngLatBounds, plan.locator);
  }

  if (plan.legend && settings.includeLegend && legendItems.length > 0) {
    drawFooterLegend(ctx, legendItems, plan.legend, plan.legendFlow, plan.pageW);
  }

  if (plan.scaleNorth && (settings.includeScale || settings.includeNorthArrow)) {
    drawFooterScaleNorth(
      ctx,
      plan.scaleNorth,
      mapLngLatBounds,
      settings.includeScale,
      settings.includeNorthArrow,
      plan.pageW,
    );
  }

  const creditLines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) creditLines.push(settings.description.trim());
  const creditParts: string[] = [];
  if (settings.includeLayerList && layerLines.length > 0) creditParts.push(layerLines.slice(0, 5).join(' · '));
  if (settings.basemapMode === 'none') creditParts.push('Basemap: none');
  else if (settings.basemapMode === 'cartographic') creditParts.push('Basemap: light gray canvas');
  else if (settings.basemapMode === 'current') creditParts.push('Basemap: current map view');
  if (creditParts.length) creditLines.push(creditParts.join(' · '));
  creditLines.push('GeoSyntra · Cartographer');
  drawCredits(ctx, creditLines, plan.credits, plan.pageW);

  if (settings.includeWatermark) {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = LUX_INK;
    ctx.font = `700 ${Math.round(plan.pageW * 0.045)}px Georgia, serif`;
    ctx.translate(plan.pageW / 2, plan.pageH * 0.5);
    ctx.rotate(-Math.PI / 10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GeoSyntra', 0, 0);
    ctx.restore();
  }

  return c.toDataURL('image/png');
}
