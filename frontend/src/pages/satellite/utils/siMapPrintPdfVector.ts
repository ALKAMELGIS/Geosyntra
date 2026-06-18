import type { jsPDF } from 'jspdf';
import { approxGroundSpanMeters, pickScaleBarLength, type SiPdfLngLatBounds } from './siAoiReportCartography';
import type { SiAoiLegendStripItem } from './siAoiReportSlotMapRender';
import type { SiMapPrintLayerIndexRow } from './siMapPrintLayerIndex';
import { computeSiMapPrintLayout, type SiMapPrintLayoutPlan } from './siMapPrintLayout';
import { downloadJsPdf } from './siMapPrintPdfDownload';
import { siMapPrintGlobeView, siMapPrintOrthoProject } from './siMapPrintGlobeLocator';
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

  const slice = items;
  if (plan.legendFlow === 'horizontal') {
    let cx = r.x + 12;
    let cy = r.y + r.h / 2 + 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    for (const it of slice) {
      const label = it.label;
      const w = 4 + doc.getTextWidth(label) + 4;
      if (cx + w > r.x + r.w - 4 && cx > r.x + 12) {
        cy += 5;
        cx = r.x + 12;
      }
      const [R, G, B] = hexToRgb(it.color);
      doc.setFillColor(R, G, B);
      doc.roundedRect(cx, cy - 1.5, 3, 3, 0.3, 0.3, 'F');
      cx += 4;
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(label, cx, cy + 0.8);
      cx += doc.getTextWidth(label) + 4;
    }
  } else {
    let ly = r.y + 7;
    const cols = slice.length > 14 ? 3 : 2;
    const colW = (r.w - 8) / cols;
    slice.forEach((it, i) => {
      const col = i % cols;
      const x = r.x + 4 + col * colW;
      if (i > 0 && i % cols === 0) ly += 5;
      const [R, G, B] = hexToRgb(it.color);
      doc.setFillColor(R, G, B);
      doc.roundedRect(x, ly, 2.5, 2.5, 0.3, 0.3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(doc.splitTextToSize(it.label, colW - 6).slice(0, 2), x + 4, ly + 2);
      if (col === cols - 1) ly += 5;
    });
  }
}

function drawPdfLayerIndex(
  doc: jsPDF,
  rows: SiMapPrintLayerIndexRow[],
  plan: SiMapPrintLayoutPlan,
  pw: number,
  ph: number,
) {
  if (!plan.layerIndex || !rows.length) return;
  const r = rectToMm(plan.layerIndex, plan, pw, ph);
  pdfPanel(doc, r.x, r.y, r.w, r.h);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text('INDEX · LIVE LAYERS', r.x + 2.5, r.y + 4);
  let ly = r.y + 8;
  for (const row of rows) {
    if (ly > r.y + r.h - 3) break;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(row.visible ? INK[0] : SLATE[0], row.visible ? INK[1] : SLATE[1], row.visible ? INK[2] : SLATE[2]);
    doc.text(`${row.label}  [${row.visible ? 'ON' : 'OFF'}]`, r.x + 3, ly);
    ly += 3.5;
    if (row.detail.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
      const detailLines = doc.splitTextToSize(row.detail.trim(), r.w - 6).slice(0, 2);
      doc.text(detailLines, r.x + 5, ly);
      ly += detailLines.length * 2.8;
    }
    ly += 1;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [100, 116, 139];
  const raw = m[1]!;
  const h = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type SiMapPrintVectorMapEmbed = {
  dataUrl: string;
  /** Placement inside map frame (px, same space as layout plan). */
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Fit map capture into the layout frame (contain) and cap size for jsPDF embedding. */
export async function prepareMapPngForVectorPdf(
  mapPng: string,
  framePx: { x: number; y: number; w: number; h: number },
  cover = true,
): Promise<SiMapPrintVectorMapEmbed> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const inset = 8;
      const inner = {
        x: framePx.x + inset,
        y: framePx.y + inset,
        w: Math.max(40, framePx.w - inset * 2),
        h: Math.max(40, framePx.h - inset * 2),
      };
      const mapAspect = img.width / Math.max(1, img.height);
      let drawW = inner.w;
      let drawH = drawW / mapAspect;
      if (cover) {
        if (drawH < inner.h) {
          drawH = inner.h;
          drawW = drawH * mapAspect;
        }
      } else if (drawH > inner.h) {
        drawH = inner.h;
        drawW = drawH * mapAspect;
      }
      const mapX = inner.x + (inner.w - drawW) / 2;
      const mapY = inner.y + (inner.h - drawH) / 2;

      const absMax = 4096;
      const scale = Math.min(
        1,
        absMax / Math.max(drawW, drawH),
        absMax / Math.max(img.width, img.height),
      );
      const outW = Math.max(1, Math.round(drawW * scale));
      const outH = Math.max(1, Math.round(drawH * scale));
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: mapPng, x: mapX, y: mapY, w: drawW, h: drawH });
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve({
        dataUrl: c.toDataURL('image/png'),
        x: mapX,
        y: mapY,
        w: drawW,
        h: drawH,
      });
    };
    img.onerror = () => reject(new Error('Could not prepare map image for vector PDF.'));
    img.src = mapPng;
  });
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
  pdfPanel(doc, r.x, r.y, r.w, r.h);

  if (settings.includeNorthArrow) {
    const nx = r.x + r.w - 9;
    const ny = r.y + r.h / 2;
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.triangle(nx, ny - 5, nx - 3.5, ny + 3, nx + 3.5, ny + 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('N', nx, ny - 6.5, { align: 'center' });
  }

  if (settings.includeScale) {
    const visibleM = bounds ? approxGroundSpanMeters(bounds) : 5000;
    const { label } = pickScaleBarLength(visibleM);
    const bx = r.x + 3;
    const by = r.y + r.h / 2 + 0.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('SCALE', bx, by - 4);
    const barMm = Math.min(42, r.w * 0.55);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.45);
    const seg = barMm / 4;
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) doc.setFillColor(INK[0], INK[1], INK[2]);
      else doc.setFillColor(248, 250, 252);
      doc.rect(bx + seg * i, by, seg, 2.2, 'F');
    }
    doc.rect(bx, by, barMm, 2.2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(label, bx, by + 3.5);
  }
}

function drawPdfGlobeLocator(
  doc: jsPDF,
  plan: SiMapPrintLayoutPlan,
  bounds: SiPdfLngLatBounds | null,
  pw: number,
  ph: number,
) {
  if (!plan.locator) return;
  const r = rectToMm(plan.locator, plan, pw, ph);
  const viewPx = siMapPrintGlobeView(plan.locator, bounds);
  const scaleX = r.w / plan.locator.w;
  const scaleY = r.h / plan.locator.h;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = Math.min(r.w, r.h) / 2 - 1.2;

  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, rad, 'F');

  const landBlobs: { lng: number; lat: number; rx: number; ry: number; g: number }[] = [
    { lng: -102, lat: 48, rx: 0.3, ry: 0.22, g: 196 },
    { lng: -62, lat: -8, rx: 0.24, ry: 0.3, g: 196 },
    { lng: 18, lat: 6, rx: 0.26, ry: 0.3, g: 184 },
    { lng: 55, lat: 38, rx: 0.32, ry: 0.2, g: 196 },
    { lng: 98, lat: 38, rx: 0.34, ry: 0.22, g: 196 },
    { lng: 128, lat: -18, rx: 0.18, ry: 0.14, g: 209 },
  ];
  for (const b of landBlobs) {
    const p = siMapPrintOrthoProject(
      b.lng,
      b.lat,
      viewPx.centerLng,
      viewPx.centerLat,
      cx,
      cy,
      rad * 0.94,
    );
    if (!p) continue;
    doc.setFillColor(b.g, b.g, b.g);
    doc.ellipse(
      p.x,
      p.y,
      (rad * b.rx * scaleX * 2) / 3,
      (rad * b.ry * scaleY * 2) / 3,
      'F',
    );
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.12);
  doc.circle(cx, cy, rad, 'S');

  const marker = siMapPrintOrthoProject(
    viewPx.markerLng,
    viewPx.markerLat,
    viewPx.centerLng,
    viewPx.centerLat,
    cx,
    cy,
    rad * 0.96,
  );
  if (marker) {
    doc.setFillColor(255, 255, 255);
    doc.circle(marker.x, marker.y, 0.55, 'F');
    doc.setFillColor(22, 101, 52);
    doc.setDrawColor(20, 83, 45);
    doc.setLineWidth(0.1);
    doc.circle(marker.x, marker.y, 0.35, 'FD');
  }
}

/** Vector PDF: map as high-quality image; title, legend, scale, north as PDF vectors. */
export async function exportSiMapPrintVectorPdf(
  mapPng: string,
  settings: SiMapPrintSettings,
  legendItems: SiAoiLegendStripItem[],
  layerIndexRows: SiMapPrintLayerIndexRow[],
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
    layerIndexRows: settings.includeLayerList ? layerIndexRows : [],
    metaLine,
  });

  const mapEmbed = await prepareMapPngForVectorPdf(mapPng, plan.mapFrame, settings.fitMapOnPaper);

  doc.setFillColor(255, 254, 251);
  doc.rect(0, 0, pw, ph, 'F');

  const title = (settings.title.trim() || 'Map export').replace(/\s+/g, ' ');
  if (settings.includeTitle) drawPdfTitle(doc, plan, title, metaLine, pw, ph);

  const frame = rectToMm(plan.mapFrame, plan, pw, ph);
  doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setLineWidth(0.45);
  doc.roundedRect(frame.x, frame.y, frame.w, frame.h, 1.5, 1.5, 'S');
  const mapRect = rectToMm({ x: mapEmbed.x, y: mapEmbed.y, w: mapEmbed.w, h: mapEmbed.h }, plan, pw, ph);
  doc.addImage(mapEmbed.dataUrl, 'PNG', mapRect.x, mapRect.y, mapRect.w, mapRect.h, undefined, 'SLOW');

  if (settings.includeLocator) {
    drawPdfGlobeLocator(doc, plan, mapLngLatBounds, pw, ph);
  }
  if (settings.includeScale || settings.includeNorthArrow) {
    drawPdfScaleNorth(doc, plan, mapLngLatBounds, settings, pw, ph);
  }

  if (settings.includeLegend && legendItems.length) {
    drawPdfLegend(doc, legendItems, plan, pw, ph);
  }
  if (settings.includeLayerList && layerIndexRows.length) {
    drawPdfLayerIndex(doc, layerIndexRows, plan, pw, ph);
  }
  const creditLines: string[] = [];
  if (settings.includeDescription && settings.description.trim()) creditLines.push(settings.description.trim());
  creditLines.push('GeoSyntra · Cartographer');
  const cr = rectToMm(plan.credits, plan, pw, ph);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
  doc.text(doc.splitTextToSize(creditLines.join(' · '), cr.w), cr.x, cr.y + 2);

  downloadJsPdf(doc, filename);
}
