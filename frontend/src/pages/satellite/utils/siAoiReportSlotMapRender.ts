import type { SiAoiClassificationPalette, SiAoiReportTableRow } from './siAoiReportCartographyTypes';

type LngLatBounds = [number, number, number, number];

function lngLatToPx(
  lng: number,
  lat: number,
  bounds: LngLatBounds,
  w: number,
  h: number,
  pad: number,
): { x: number; y: number } {
  const [west, south, east, north] = bounds;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const x = pad + ((lng - west) / Math.max(1e-12, east - west)) * innerW;
  const y = pad + (1 - (lat - south) / Math.max(1e-12, north - south)) * innerH;
  return { x, y };
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  coords: number[][][],
  bounds: LngLatBounds,
  w: number,
  h: number,
  pad: number,
) {
  for (const ring of coords) {
    if (!ring.length) continue;
    const p0 = lngLatToPx(ring[0]![0]!, ring[0]![1]!, bounds, w, h, pad);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ring.length; i++) {
      const p = lngLatToPx(ring[i]![0]!, ring[i]![1]!, bounds, w, h, pad);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
}

/** Client-side AOI heatmap render when live Mapbox capture is unavailable. */
export async function renderAoiHeatmapSlotPng(
  heatmap: GeoJSON.FeatureCollection,
  aoiOutline: GeoJSON.FeatureCollection,
  bounds: LngLatBounds,
  outlineColor: string,
  width = 520,
  height = 390,
): Promise<string> {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';

  const pad = 8;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  for (const f of heatmap.features) {
    const g = f.geometry;
    if (!g) continue;
    const fill = (f.properties?.fill as string) ?? '#22c55e';
    const opacity = Number(f.properties?.opacity ?? 0.5);
    ctx.fillStyle = fill;
    ctx.globalAlpha = Math.min(1, Math.max(0.08, opacity));
    ctx.beginPath();
    if (g.type === 'Polygon') tracePolygon(ctx, g.coordinates as number[][][], bounds, width, height, pad);
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) tracePolygon(ctx, poly, bounds, width, height, pad);
    }
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  const aoi = aoiOutline.features[0];
  if (aoi?.geometry) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const geom = aoi.geometry;
    if (geom.type === 'Polygon') tracePolygon(ctx, geom.coordinates as number[][][], bounds, width, height, pad);
    else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates as number[][][][])
        tracePolygon(ctx, poly, bounds, width, height, pad);
    }
    ctx.stroke();
  }

  return c.toDataURL('image/png');
}

export type SiAoiLegendStripItem = { label: string; color: string };

export function drawHorizontalLegendStrip(
  ctx: CanvasRenderingContext2D,
  items: SiAoiLegendStripItem[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(x, y, w, h);
  const pad = Math.round(h * 0.22);
  const sw = Math.round(h * 0.36);
  let fontPx = Math.round(Math.max(9, Math.min(16, h * 0.3)));
  const gapAfterSw = 6;
  const gapBetween = 10;
  for (let attempt = 0; attempt < 10; attempt++) {
    ctx.font = `500 ${fontPx}px system-ui, "Segoe UI", sans-serif`;
    let tw = pad * 2 + items.length * sw + items.length * gapAfterSw;
    for (const it of items) tw += ctx.measureText(it.label).width + gapBetween;
    if (tw <= w || fontPx <= 8) break;
    fontPx -= 1;
  }
  ctx.textBaseline = 'middle';
  let cx = x + pad;
  const cy = y + h / 2;
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.fillRect(cx, cy - sw / 2, sw, sw);
    cx += sw + gapAfterSw;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(it.label, cx, cy);
    cx += ctx.measureText(it.label).width + gapBetween;
    if (cx > x + w - pad) break;
  }
}

export async function compositeMapWithBottomLegendStrip(
  mapPngDataUrl: string,
  items: SiAoiLegendStripItem[],
  drawMapExtras?: (ctx: CanvasRenderingContext2D, mapW: number, mapH: number) => void,
): Promise<string> {
  try {
    const img = await loadImageElement(mapPngDataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return mapPngDataUrl;
    const strip = Math.round(Math.min(88, Math.max(42, w * 0.09)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h + strip;
    const ctx = c.getContext('2d');
    if (!ctx) return mapPngDataUrl;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h + strip);
    ctx.drawImage(img, 0, 0);
    drawMapExtras?.(ctx, w, h);
    drawHorizontalLegendStrip(ctx, items, 0, h, w, strip);
    return c.toDataURL('image/png');
  } catch {
    return mapPngDataUrl;
  }
}

export function legendItemsFromTableRows(
  tableRows: SiAoiReportTableRow[],
  palette: SiAoiClassificationPalette,
  indexId?: string,
): SiAoiLegendStripItem[] {
  const items: SiAoiLegendStripItem[] = tableRows.map(r => ({
    label: r.labelEn,
    color:
      r.colorHex ??
      (r.key === 'high' ? palette.high : r.key === 'medium' ? palette.medium : r.key === 'low' ? palette.low : '#94a3b8'),
  }));
  items.push({ label: 'AOI outline', color: palette.aoiOutline });
  if (indexId) items.push({ label: indexId, color: '#94a3b8' });
  return items;
}
