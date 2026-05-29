import type { jsPDF } from 'jspdf';
import { approxGroundSpanMeters, pickScaleBarLength, type SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import { computeSiMapPrintLayout, type SiMapPrintLayoutPlan } from './siMapPrintLayout';
import type { SiMapPrintSettings } from './siMapPrintTypes';

const GOLD: [number, number, number] = [184, 149, 74];
const INK: [number, number, number] = [15, 23, 42];
const SLATE: [number, number, number] = [71, 85, 105];

function pxToMm(px: number, pagePx: number, pageMm: number): number {
  return (px / pagePx) * pageMm;
}

function rectToMm(rect: { x: number; y: number; w: number; h: number }, plan: SiMapPrintLayoutPlan, pw: number, ph: number) {
  return {
    x: pxToMm(rect.x, plan.pageW, pw),
    y: pxToMm(rect.y, plan.pageH, ph),
    w: pxToMm(rect.w, plan.pageW, pw),
    h: pxToMm(rect.h, plan.pageH, ph),
  };
}

function pdfPanel(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(255, 252, 248);
  doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, 'FD');
}

function drawPdfTitle(doc: jsPDF, plan: SiMapPrintLayoutPlan, title: string, meta: string | undefined, pw: number, ph: number) {
  if (!plan.title) return;
  const r = rectToMm(plan.title, plan, pw, ph);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const lines = doc.splitTextToSize(title, r.w - 4);
  doc.text(lines.slice(0, 2), r.x + r.w / 2, r.y + 5, { align: 'center' });
  if (meta?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    const sub = doc.splitTextToSize(meta.trim(), r.w - 6);
    doc.text(sub.slice(0, 2), r.x + r.w / 2, r.y + 11, { align: 'center' });
  }
}

function drawPdfLegend(
  doc: jsPDF,
  items: SiAoiLegendStripItem[],
  plan: SiMapPrintLayoutPlan,
  pw: number,
  ph: number,
) {
  if (!plan.legend || !items.length) return;
  const r = rectToMm(plan.legend, plan, pw, ph);
  pdfPanel(doc, r.x, r.y, r.w, r.h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text('KEY', r.x + 2.5, r.y + 4);

  const slice = items.slice(0, plan.legendFlow === 'vertical' ? 12 : 10);
  if (plan.legendFlow === 'horizontal') {
    let cx = r.x + 12;
    const cy = r.y + r.h / 2 + 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    for (const it of slice) {
      const [R, G, B] = hexToRgb(it.color);
      doc.setFillColor(R, G, B);
      doc.roundedRect(cx, cy - 1.5, 3, 3, 0.3, 0.3, 'F');
      cx += 4;
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(it.label.slice(0, 28), cx, cy + 0.8);
      cx += doc.getTextWidth(it.label.slice(0, 28)) + 4;
    }
  } else {
    let ly = r.y + 7;
    const colW = (r.w - 8) / 2;
    slice.forEach((it, i) => {
      const col = i % 2;
      const x = r.x + 4 + col * colW;
      if (i > 0 && i % 2 === 0) ly += 5;
      const [R, G, B] = hexToRgb(it.color);
      doc.setFillColor(R, G, B);
      doc.roundedRect(x, ly, 2.5, 2.5, 0.3, 0.3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(it.label.slice(0, 24), x + 4, ly + 2);
      if (col === 1) ly += 5;
    });
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawPdfScaleNorth(
  doc: jsPDF,
  plan: SiMapPrintLayoutPlan,
  bounds: SiPdfLngLatBounds | null,
  settings: SiMapPrintSettings,
  pw: number,
  ph: number,
) {
  if (!plan.scaleNorth) return;
  const r = rectToMm(plan.scaleNorth, plan, pw, ph);
  const cardW = Math.min(r.w * 0.45, 72);
  const cardX = r.x + r.w - cardW - 1;
  pdfPanel(doc, cardX, r.y + 0.5, cardW, r.h - 1);

  if (settings.includeNorthArrow) {
    const nx = cardX + cardW - 8;
    const ny = r.y + r.h / 2;
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.triangle(nx, ny - 3.5, nx - 2.5, ny + 2, nx + 2.5, ny + 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('N', nx, ny - 4.5, { align: 'center' });
  }

  if (settings.includeScale) {
    const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
    const { label } = pickScaleBarLength(visibleM);
    const bx = cardX + 4;
    const by = r.y + r.h / 2 + 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('SCALE', bx, by - 3);
    const barMm = 28;
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.35);
    doc.line(bx, by, bx + barMm, by);
    doc.line(bx, by - 1, bx, by + 1);
    doc.line(bx + barMm, by - 1, bx + barMm, by + 1);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(label, bx, by + 2);
  }
}

/** Vector PDF: map as high-quality image; title, legend, scale, north as PDF vectors. */
export async function exportSiMapPrintVectorPdf(
  mapPng: string,
  settings: SiMapPrintSettings,
  legendItems: SiAoiLegendStripItem[],
  layerLines: string[],
  mapLngLatBounds: SiPdfLngLatBounds | null,
  metaLine: string | undefined,
  filename: string,
) {
  const { default: jsPDF } = await import('jspdf');
  const orientation = settings.orientation === 'landscape' ? 'landscape' : 'portrait';
  const format = settings.paper.toLowerCase() as 'a4' | 'a3';
  const doc = new jsPDF({ orientation, unit: 'mm', format, compress: false });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  const plan = computeSiMapPrintLayout({
    settings,
    legendItems: settings.includeLegend ? legendItems : [],
    layerLines: settings.includeLayerList ? layerLines : [],
    metaLine,
  });

  doc.setFillColor(255, 254, 251);
  doc.rect(0, 0, pw, ph, 'F');

  const title = (settings.title.trim() || 'Map export').replace(/\s+/g, ' ');
  if (settings.includeTitle) drawPdfTitle(doc, plan, title, metaLine, pw, ph);

  const frame = rectToMm(plan.mapFrame, plan, pw, ph);
  doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setLineWidth(0.45);
  doc.roundedRect(frame.x, frame.y, frame.w, frame.h, 1.5, 1.5, 'S');
  const inset = 1.2;
  doc.addImage(mapPng, 'PNG', frame.x + inset, frame.y + inset, frame.w - inset * 2, frame.h - inset * 2, undefined, 'SLOW');

  if (settings.includeLegend && legendItems.length) {
    drawPdfLegend(doc, legendItems, plan, pw, ph);
  }
  if (settings.includeScale || settings.includeNorthArrow) {
    drawPdfScaleNorth(doc, plan, mapLngLatBounds, settings, pw, ph);
  }

  const creditLines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) creditLines.push(settings.description.trim());
  if (settings.includeLayerList && layerLines.length) creditLines.push(layerLines.slice(0, 5).join(' · '));
  creditLines.push('GeoSyntra · Cartographer');
  const cr = rectToMm(plan.credits, plan, pw, ph);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text(doc.splitTextToSize(creditLines.join(' · '), cr.w), cr.x, cr.y + 2);

  doc.save(filename);
}
