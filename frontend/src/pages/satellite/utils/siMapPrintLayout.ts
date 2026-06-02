import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import { measureSiMapPrintLayerIndexBand, type SiMapPrintLayerIndexRow } from './siMapPrintLayerIndex';
import type { SiMapPrintElementId, SiMapPrintLayoutOffsets, SiMapPrintSettings } from './siMapPrintTypes';
import { siMapPrintAspectRatio } from './siMapPrintTypes';

export type SiMapPrintRect = { x: number; y: number; w: number; h: number };

export type SiMapPrintLayoutPlan = {
  pageW: number;
  pageH: number;
  margin: number;
  mapFrame: SiMapPrintRect;
  title?: SiMapPrintRect;
  meta?: SiMapPrintRect;
  legend?: SiMapPrintRect;
  legendFlow: 'horizontal' | 'vertical';
  layerIndex?: SiMapPrintRect;
  /** Scale + north overlay inside the map frame (bottom-right). */
  scaleNorth?: SiMapPrintRect;
  /** Globe locator overlay inside the map frame (top-left). */
  locator?: SiMapPrintRect;
  credits: SiMapPrintRect;
};

function pageDimensions(settings: SiMapPrintSettings): { pageW: number; pageH: number } {
  const aspect = siMapPrintAspectRatio(settings);
  const baseW = settings.paper === 'A3' ? 3508 : 2480;
  const pageW = settings.orientation === 'landscape' ? baseW : Math.round(baseW / aspect);
  const pageH = Math.round(pageW / aspect);
  return { pageW, pageH };
}

function measureHeaderHeights(
  settings: SiMapPrintSettings,
  pageW: number,
  contentW: number,
  metaLine?: string,
): number {
  if (!settings.includeTitle) return 0;
  const titlePx = Math.round(pageW * 0.0135);
  const subPx = Math.round(pageW * 0.0088);
  const mc = document.createElement('canvas').getContext('2d')!;
  const title = (settings.title.trim() || 'Map export').replace(/\s+/g, ' ');
  mc.font = `600 ${titlePx}px Georgia, serif`;
  const titleLines = Math.min(2, wrapMeasure(mc, title, contentW * 0.9).length);
  let h = titleLines * titlePx * 1.06 + 10;
  if (metaLine?.trim()) {
    mc.font = `400 ${subPx}px "Segoe UI", system-ui, sans-serif`;
    h += Math.min(2, wrapMeasure(mc, metaLine.trim(), contentW * 0.86).length) * subPx * 1.22 + 4;
  }
  return Math.min(h, Math.round(pageW * 0.055));
}

function wrapMeasure(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

function measureLegendBand(
  settings: SiMapPrintSettings,
  pageW: number,
  contentW: number,
  legendCount: number,
): { h: number; flow: 'horizontal' | 'vertical' } {
  if (!settings.includeLegend || legendCount <= 0) return { h: 0, flow: 'horizontal' };
  const portrait = settings.orientation === 'portrait';
  const flow: 'horizontal' | 'vertical' = portrait || legendCount > 6 ? 'vertical' : 'horizontal';
  if (flow === 'horizontal') {
    const swatchW = Math.round(pageW * 0.012);
    const mc = document.createElement('canvas').getContext('2d')!;
    const fontPx = Math.max(8, Math.round(pageW * 0.0085));
    mc.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
    let rowW = 0;
    let rowCount = 1;
    const gap = 10;
    for (let i = 0; i < legendCount; i++) {
      const est = swatchW + 6 + 48;
      if (rowW + est > contentW && rowW > 0) {
        rowCount++;
        rowW = 0;
      }
      rowW += est + gap;
    }
    return { h: Math.round(16 + rowCount * (fontPx * 1.65)), flow };
  }
  const cols = legendCount > 14 ? 3 : 2;
  const rows = Math.ceil(legendCount / cols);
  return { h: Math.round(20 + rows * (pageW * 0.0125)), flow };
}

/** Scale/north render as map overlays — no footer band. */
function measureInstrumentsBand(settings: SiMapPrintSettings, _pageW: number): number {
  void settings;
  return 0;
}

function measureMapScaleNorthOverlay(
  settings: SiMapPrintSettings,
  mapFrame: SiMapPrintRect,
  pageW: number,
): SiMapPrintRect | undefined {
  if (!settings.includeScale && !settings.includeNorthArrow) return undefined;
  const pad = Math.round(Math.min(mapFrame.w, mapFrame.h) * 0.022);
  const h = Math.round(Math.max(pageW * 0.052, 78));
  const w = Math.round(Math.min(mapFrame.w * 0.42, pageW * 0.2));
  return {
    x: mapFrame.x + mapFrame.w - w - pad,
    y: mapFrame.y + mapFrame.h - h - pad,
    w,
    h,
  };
}

function measureMapGlobeLocatorOverlay(mapFrame: SiMapPrintRect): SiMapPrintRect {
  const pad = Math.round(Math.min(mapFrame.w, mapFrame.h) * 0.022);
  const size = Math.round(
    Math.max(140, Math.min(220, Math.min(mapFrame.w, mapFrame.h) * 0.26)),
  );
  return {
    x: mapFrame.x + pad,
    y: mapFrame.y + pad,
    w: size,
    h: size,
  };
}

function measureCreditsBand(settings: SiMapPrintSettings, pageW: number, contentW: number): number {
  const lines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) lines.push(settings.description.trim());
  const creditParts: string[] = [];
  if (settings.basemapMode === 'none') creditParts.push('Basemap: none');
  else if (settings.basemapMode === 'cartographic') creditParts.push('Basemap: light gray canvas');
  else if (settings.basemapMode === 'current') creditParts.push('Basemap: current map view');
  if (creditParts.length) lines.push(creditParts.join(' · '));
  lines.push('GeoSyntra · Cartographer');
  const fontPx = Math.max(8, Math.round(pageW * 0.0088));
  const mc = document.createElement('canvas').getContext('2d')!;
  mc.font = `400 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  let h = 0;
  for (const line of lines) h += wrapMeasure(mc, line, contentW * 0.92).length * fontPx * 1.28;
  return Math.min(Math.round(h + 6), Math.round(pageW * 0.045));
}

function applyOffset(rect: SiMapPrintRect, id: SiMapPrintElementId, offsets: SiMapPrintLayoutOffsets, pageW: number, pageH: number): SiMapPrintRect {
  const o = offsets[id];
  if (!o) return rect;
  return {
    x: rect.x + o.dxPct * pageW,
    y: rect.y + o.dyPct * pageH,
    w: rect.w,
    h: rect.h,
  };
}

export function computeSiMapPrintLayout(input: {
  settings: SiMapPrintSettings;
  legendItems: SiAoiLegendStripItem[];
  layerIndexRows: SiMapPrintLayerIndexRow[];
  metaLine?: string;
}): SiMapPrintLayoutPlan {
  const { settings, legendItems, layerIndexRows, metaLine } = input;
  const { pageW, pageH } = pageDimensions(settings);
  const margin = Math.round(pageW * (settings.fitMapOnPaper ? 0.032 : 0.038));
  const contentW = pageW - margin * 2;
  const gap = Math.round(pageH * 0.008);

  const headerH = measureHeaderHeights(settings, pageW, contentW, metaLine);
  const { h: legendH, flow: legendFlow } = measureLegendBand(settings, pageW, contentW, legendItems.length);
  const layerIndexH = measureSiMapPrintLayerIndexBand(settings, pageW, contentW, layerIndexRows);
  const instrH = measureInstrumentsBand(settings, pageW);
  const creditH = measureCreditsBand(settings, pageW, contentW);

  const footerStack =
    legendH +
    (legendH && layerIndexH ? gap : 0) +
    layerIndexH +
    (layerIndexH && instrH ? gap : legendH && instrH ? gap : 0) +
    instrH +
    gap +
    creditH;
  const mapFrameTop = margin + headerH + (headerH ? gap : 0);
  const mapFrameBottom = pageH - margin - footerStack;
  const mapFrameH = Math.max(120, mapFrameBottom - mapFrameTop);

  const plan: SiMapPrintLayoutPlan = {
    pageW,
    pageH,
    margin,
    mapFrame: { x: margin, y: mapFrameTop, w: contentW, h: mapFrameH },
    legendFlow,
    credits: { x: margin, y: pageH - margin - creditH, w: contentW, h: creditH },
  };

  let y = margin;
  if (settings.includeTitle) {
    const titleBlockH = headerH;
    plan.title = { x: margin, y, w: contentW, h: titleBlockH };
    y += titleBlockH + gap;
  }

  let footerY = mapFrameTop + mapFrameH + gap;
  if (legendH > 0) {
    plan.legend = { x: margin, y: footerY, w: contentW, h: legendH };
    footerY += legendH + gap;
  }
  if (layerIndexH > 0) {
    plan.layerIndex = { x: margin, y: footerY, w: contentW, h: layerIndexH };
    footerY += layerIndexH + gap;
  }
  if (settings.includeScale || settings.includeNorthArrow) {
    plan.scaleNorth = measureMapScaleNorthOverlay(settings, plan.mapFrame, pageW);
  }
  if (settings.includeLocator) {
    plan.locator = measureMapGlobeLocatorOverlay(plan.mapFrame);
  }

  if (settings.customLayout) {
    const off = settings.layoutOffsets ?? {};
    if (plan.title) plan.title = applyOffset(plan.title, 'title', off, pageW, pageH);
    if (plan.legend) plan.legend = applyOffset(plan.legend, 'legend', off, pageW, pageH);
    if (plan.scaleNorth) plan.scaleNorth = applyOffset(plan.scaleNorth, 'scaleNorth', off, pageW, pageH);
    plan.credits = applyOffset(plan.credits, 'credits', off, pageW, pageH);
  }

  return plan;
}

/** Preview overlay boxes as % of page for custom layout UI. */
export function siMapPrintLayoutToPercentRects(plan: SiMapPrintLayoutPlan): Partial<
  Record<SiMapPrintElementId, { left: string; top: string; width: string; height: string }>
> {
  const pct = (r: SiMapPrintRect) => ({
    left: `${(r.x / plan.pageW) * 100}%`,
    top: `${(r.y / plan.pageH) * 100}%`,
    width: `${(r.w / plan.pageW) * 100}%`,
    height: `${(r.h / plan.pageH) * 100}%`,
  });
  const out: Partial<Record<SiMapPrintElementId, { left: string; top: string; width: string; height: string }>> = {};
  if (plan.title) out.title = pct(plan.title);
  if (plan.legend) out.legend = pct(plan.legend);
  if (plan.scaleNorth) out.scaleNorth = pct(plan.scaleNorth);
  if (plan.credits) out.credits = pct(plan.credits);
  return out;
}
