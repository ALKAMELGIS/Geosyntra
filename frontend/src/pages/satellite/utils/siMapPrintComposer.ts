import { drawNorthArrowAndScaleOnMapCanvas } from './siAoiReportCartography';
import { drawHorizontalLegendStrip, type SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
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

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 72px system-ui, "Segoe UI", sans-serif';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GeoSyntra', 0, 0);
  ctx.restore();
}

/**
 * Composes a print-ready page raster (title, map, legend, layer list, cartography).
 */
export async function composeSiMapPrintPage(input: SiMapPrintComposeInput): Promise<string> {
  const { mapPng, settings, legendItems, layerLines, mapLngLatBounds, metaLine } = input;
  const img = await loadImage(mapPng);
  const aspect = siMapPrintAspectRatio(settings);
  const baseW = settings.paper === 'A3' ? 3508 : 2480;
  const pageW = settings.orientation === 'landscape' ? baseW : Math.round(baseW / aspect);
  const pageH = Math.round(pageW / aspect);
  const margin = Math.round(pageW * 0.04);
  const headerH = settings.includeTitle ? Math.round(pageH * 0.09) : Math.round(pageH * 0.025);
  const footerH = settings.includeDescription && settings.description.trim() ? Math.round(pageH * 0.07) : 0;
  const legendH =
    settings.includeLegend && legendItems.length > 0 ? Math.round(Math.min(96, pageW * 0.055)) : 0;
  const layerW =
    settings.includeLayerList && layerLines.length > 0 ? Math.round(Math.min(280, pageW * 0.22)) : 0;

  const contentTop = margin + headerH;
  const contentBottom = pageH - margin - footerH - legendH;
  const contentLeft = margin;
  const contentRight = pageW - margin - layerW;
  const mapBoxW = Math.max(120, contentRight - contentLeft);
  const mapBoxH = Math.max(120, contentBottom - contentTop);

  const mapAspect = img.width / Math.max(1, img.height);
  let drawW = mapBoxW;
  let drawH = drawW / mapAspect;
  if (drawH > mapBoxH) {
    drawH = mapBoxH;
    drawW = drawH * mapAspect;
  }
  const mapX = contentLeft + (mapBoxW - drawW) / 2;
  const mapY = contentTop + (mapBoxH - drawH) / 2;

  const c = document.createElement('canvas');
  c.width = pageW;
  c.height = pageH;
  const ctx = c.getContext('2d');
  if (!ctx) return mapPng;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, pageW, pageH);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin / 2, margin / 2, pageW - margin, pageH - margin);

  if (settings.includeTitle) {
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${Math.round(pageW * 0.028)}px system-ui, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(settings.title.trim() || 'GeoSyntra map export', margin, margin);
    if (metaLine?.trim()) {
      ctx.font = `500 ${Math.round(pageW * 0.014)}px system-ui, "Segoe UI", sans-serif`;
      ctx.fillStyle = '#475569';
      ctx.fillText(metaLine.trim(), margin, margin + Math.round(pageH * 0.045));
    }
  }

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(Math.floor(mapX) - 2, Math.floor(mapY) - 2, Math.ceil(drawW) + 4, Math.ceil(drawH) + 4);
  ctx.drawImage(img, mapX, mapY, drawW, drawH);

  if (settings.includeNorthArrow || settings.includeScale) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, drawW, drawH);
    ctx.clip();
    ctx.translate(mapX, mapY);
    drawNorthArrowAndScaleOnMapCanvas(
      ctx,
      drawW,
      drawH,
      settings.includeScale ? mapLngLatBounds : null,
    );
    ctx.restore();
  }

  if (settings.includeLayerList && layerLines.length > 0) {
    const lx = pageW - margin - layerW + 12;
    let ly = contentTop + 8;
    const panelH = mapBoxH;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(lx - 12, ly - 8, layerW - 8, panelH);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `700 ${Math.round(pageW * 0.013)}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillText('Layers', lx, ly);
    ly += Math.round(pageH * 0.035);
    ctx.font = `500 ${Math.round(pageW * 0.011)}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    for (const line of layerLines.slice(0, 14)) {
      const rows = wrapLines(ctx, `• ${line}`, layerW - 28);
      for (const row of rows) {
        ctx.fillText(row, lx, ly);
        ly += Math.round(pageH * 0.022);
        if (ly > contentTop + panelH - 12) break;
      }
      if (ly > contentTop + panelH - 12) break;
    }
  }

  if (legendH > 0 && legendItems.length > 0) {
    drawHorizontalLegendStrip(ctx, legendItems, margin, pageH - margin - footerH - legendH, pageW - margin * 2, legendH);
  }

  if (footerH > 0) {
    ctx.fillStyle = '#334155';
    ctx.font = `500 ${Math.round(pageW * 0.012)}px system-ui, "Segoe UI", sans-serif`;
    const lines = wrapLines(ctx, settings.description.trim(), pageW - margin * 2);
    let fy = pageH - margin - footerH + 8;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, margin, fy);
      fy += Math.round(pageH * 0.024);
    }
  }

  if (settings.includeWatermark) drawWatermark(ctx, pageW, pageH);

  return c.toDataURL('image/png');
}
