import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
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
  scaleNorth?: SiMapPrintRect;
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
  const flow: 'horizontal' | 'vertical' = portrait || legendCount > 8 ? 'vertical' : 'horizontal';
  if (flow === 'horizontal') {
    return { h: Math.round(pageW * 0.038), flow };
  }
  const rows = Math.ceil(Math.min(legendCount, 12) / 2);
  return { h: Math.round(18 + rows * (pageW * 0.0118)), flow };
}

function measureInstrumentsBand(settings: SiMapPrintSettings, pageW: number): number {
  if (!settings.includeScale && !settings.includeNorthArrow) return 0;
  return Math.round(pageW * 0.034);
}

function measureCreditsBand(
  settings: SiMapPrintSettings,
  pageW: number,
  contentW: number,
  layerLines: string[],
): number {
  const lines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) lines.push(settings.description.trim());
  const creditParts: string[] = [];
  if (settings.includeLayerList && layerLines.length > 0) creditParts.push(layerLines.slice(0, 5).join(' · '));
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
  layerLines: string[];
  metaLine?: string;
}): SiMapPrintLayoutPlan {
  const { settings, legendItems, layerLines, metaLine } = input;
  const { pageW, pageH } = pageDimensions(settings);
  const margin = Math.round(pageW * 0.038);
  const contentW = pageW - margin * 2;
  const gap = Math.round(pageH * 0.008);

  const headerH = measureHeaderHeights(settings, pageW, contentW, metaLine);
  const { h: legendH, flow: legendFlow } = measureLegendBand(settings, pageW, contentW, legendItems.length);
  const instrH = measureInstrumentsBand(settings, pageW);
  const creditH = measureCreditsBand(settings, pageW, contentW, layerLines);

  const footerStack = legendH + (legendH && instrH ? gap : 0) + instrH + gap + creditH;
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
  if (instrH > 0) {
    plan.scaleNorth = { x: margin, y: footerY, w: contentW, h: instrH };
    footerY += instrH + gap;
  }

  if (settings.includeLocator) {
    const insetW = Math.round(Math.min(plan.mapFrame.w * 0.2, 160));
    const insetH = Math.round(insetW * 0.76);
    const pad = Math.round(Math.min(plan.mapFrame.w, plan.mapFrame.h) * 0.022);
    plan.locator = {
      x: plan.mapFrame.x + pad,
      y: plan.mapFrame.y + pad,
      w: insetW,
      h: insetH,
    };
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
