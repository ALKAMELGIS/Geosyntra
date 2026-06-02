import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import type { SiMapPrintLayerIndexRow } from './siMapPrintLayerIndex';
import { drawSiMapPrintScaleNorthOverlay } from './siMapPrintCartographyChrome';
import { drawSiMapPrintGlobeLocator } from './siMapPrintGlobeLocator';
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
  const inset = cover ? 4 : 8;
  const inner = {
    x: frame.x + inset,
    y: frame.y + inset,
    w: Math.max(40, frame.w - inset * 2),
    h: Math.max(40, frame.h - inset * 2),
  };
  const mapAspect = imgW / Math.max(1, imgH);
  if (cover) {
    let drawW = inner.w;
    let drawH = drawW / mapAspect;
    if (drawH < inner.h) {
      drawH = inner.h;
      drawW = drawH * mapAspect;
    }
    return {
      drawW,
      drawH,
      mapX: inner.x + (inner.w - drawW) / 2,
      mapY: inner.y + (inner.h - drawH) / 2,
    };
  }
  let drawW = inner.w;
  let drawH = drawW / mapAspect;
  if (drawH > inner.h) {
    drawH = inner.h;
    drawW = drawH * mapAspect;
  }
  return {
    drawW,
    drawH,
    mapX: inner.x + (inner.w - drawW) / 2,
    mapY: inner.y + (inner.h - drawH) / 2,
  };
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

  const slice = items;
  const innerX = rect.x + 10;
  const innerY = rect.y + kickerPx + 10;
  const innerW = rect.w - 20;
  const innerH = rect.h - kickerPx - 14;

  if (flow === 'horizontal') {
    const sw = Math.max(11, Math.round(pageW * 0.011));
    let fontPx = Math.max(9, Math.round(pageW * 0.0098));
    const gap = 10;
    const rowGap = fontPx * 1.35;
    ctx.textBaseline = 'middle';
    let cx = innerX;
    let cy = innerY + sw / 2 + 2;
    for (let attempt = 0; attempt < 5; attempt++) {
      ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
      let fits = true;
      let tx = innerX;
      let ty = innerY + sw / 2 + 2;
      for (const it of slice) {
        const w = sw + 6 + ctx.measureText(it.label).width + gap;
        if (tx + w > innerX + innerW && tx > innerX) {
          ty += rowGap;
          tx = innerX;
        }
        if (ty > innerY + innerH) {
          fits = false;
          break;
        }
        tx += w;
      }
      if (fits || fontPx <= 7) break;
      fontPx -= 1;
    }
    ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    cx = innerX;
    cy = innerY + sw / 2 + 2;
    for (const it of slice) {
      const w = sw + 6 + ctx.measureText(it.label).width + gap;
      if (cx + w > innerX + innerW && cx > innerX) {
        cy += rowGap;
        cx = innerX;
      }
      ctx.fillStyle = it.color;
      fillRoundRect(ctx, cx, cy - sw / 2, sw, sw, 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.2)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(cx + 0.5, cy - sw / 2 + 0.5, sw - 1, sw - 1);
      cx += sw + 6;
      ctx.fillStyle = LUX_INK;
      ctx.fillText(it.label, cx, cy);
      cx += ctx.measureText(it.label).width + gap;
    }
  } else {
    const cols = slice.length > 14 ? 3 : 2;
    const colW = innerW / cols - 8;
    const sw = Math.max(8, Math.round(pageW * 0.0085));
    const rowH = Math.max(12, innerH / Math.ceil(slice.length / cols));
    let fontPx = Math.max(7, Math.round(rowH * 0.5));
    ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    slice.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = innerX + col * (colW + 10);
      const y = innerY + row * rowH + rowH / 2;
      ctx.fillStyle = it.color;
      fillRoundRect(ctx, x, y - sw / 2, sw, sw, 2);
      ctx.fillStyle = LUX_INK;
      const maxChars = Math.max(12, Math.floor(colW / (fontPx * 0.52)));
      const label = it.label.length > maxChars ? `${it.label.slice(0, maxChars - 1)}…` : it.label;
      ctx.fillText(label, x + sw + 5, y);
    });
  }
  ctx.restore();
}

function drawLayerIndex(
  ctx: CanvasRenderingContext2D,
  rows: SiMapPrintLayerIndexRow[],
  rect: SiMapPrintRect,
  pageW: number,
) {
  if (!rows.length) return;
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
  ctx.fillText('INDEX · LIVE LAYERS', rect.x + 10, rect.y + 6);

  const fontPx = Math.max(7, Math.round(pageW * 0.0082));
  const detailPx = Math.max(6, fontPx - 1);
  let y = rect.y + kickerPx + 12;
  const x0 = rect.x + 10;
  const maxW = rect.w - 20;

  for (const row of rows) {
    ctx.font = `600 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = row.visible ? LUX_INK : LUX_SLATE;
    const visTag = row.visible ? 'ON' : 'OFF';
    const head = `${row.label}  [${visTag}]`;
    ctx.fillText(head, x0, y);
    if (row.detail.trim()) {
      y += fontPx * 1.05;
      ctx.font = `400 ${detailPx}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = LUX_SLATE;
      for (const line of wrapLines(ctx, row.detail.trim(), maxW).slice(0, 2)) {
        ctx.fillText(line, x0 + 8, y);
        y += detailPx * 1.25;
      }
    }
    y += fontPx * 0.55;
    if (y > rect.y + rect.h - 4) break;
  }
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
  const { mapPng, settings, legendItems, layerIndexRows, mapLngLatBounds, metaLine } = input;
  const img = await loadImage(mapPng);
  const plan = computeSiMapPrintLayout({
    settings,
    legendItems: settings.includeLegend ? legendItems : [],
    layerIndexRows: settings.includeLayerList ? layerIndexRows : [],
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
    drawSiMapPrintGlobeLocator(ctx, plan.locator, mapLngLatBounds);
  }

  if (plan.scaleNorth && (settings.includeScale || settings.includeNorthArrow)) {
    drawSiMapPrintScaleNorthOverlay(
      ctx,
      plan.scaleNorth,
      mapLngLatBounds,
      settings.includeScale,
      settings.includeNorthArrow,
      plan.pageW,
    );
  }

  if (plan.legend && settings.includeLegend && legendItems.length > 0) {
    drawFooterLegend(ctx, legendItems, plan.legend, plan.legendFlow, plan.pageW);
  }

  if (plan.layerIndex && settings.includeLayerList && layerIndexRows.length > 0) {
    drawLayerIndex(ctx, layerIndexRows, plan.layerIndex, plan.pageW);
  }

  const creditLines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) creditLines.push(settings.description.trim());
  const creditParts: string[] = [];
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
