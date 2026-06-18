import type { SiPdfLngLatBounds } from './siAoiReportCartography';

export type SiMapPrintRect = { x: number; y: number; w: number; h: number };

const DEG = Math.PI / 180;

export type SiMapPrintGlobePoint = { x: number; y: number };

export type SiMapPrintGlobeView = {
  cx: number;
  cy: number;
  radius: number;
  centerLng: number;
  centerLat: number;
  markerLng: number;
  markerLat: number;
};

/** Orthographic projection (globe view) — returns null when on the far hemisphere. */
export function siMapPrintOrthoProject(
  lng: number,
  lat: number,
  centerLng: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
): SiMapPrintGlobePoint | null {
  const λ = lng * DEG;
  const φ = lat * DEG;
  const λ0 = centerLng * DEG;
  const φ0 = centerLat * DEG;
  const cosC = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ - λ0);
  if (cosC <= 0.04) return null;
  const x = radius * Math.cos(φ) * Math.sin(λ - λ0);
  const y = radius * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ - λ0));
  return { x: cx + x, y: cy - y };
}

export function siMapPrintGlobeView(
  rect: SiMapPrintRect,
  bounds: SiPdfLngLatBounds | null,
): SiMapPrintGlobeView {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const radius = Math.min(rect.w, rect.h) / 2 - 4;
  const centerLng = bounds ? (bounds.west + bounds.east) / 2 : 0;
  const centerLat = bounds ? (bounds.south + bounds.north) / 2 : 20;
  return {
    cx,
    cy,
    radius,
    centerLng,
    centerLat,
    markerLng: centerLng,
    markerLat: centerLat,
  };
}

function strokeOrthoPath(
  ctx: CanvasRenderingContext2D,
  lngLatPairs: [number, number][],
  centerLng: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
) {
  let open = false;
  for (const [lng, lat] of lngLatPairs) {
    const p = siMapPrintOrthoProject(lng, lat, centerLng, centerLat, cx, cy, radius);
    if (p) {
      if (!open) {
        ctx.moveTo(p.x, p.y);
        open = true;
      } else ctx.lineTo(p.x, p.y);
    } else open = false;
  }
  if (open) ctx.stroke();
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  centerLng: number,
  centerLat: number,
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.lineWidth = 0.55;
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 5) pts.push([lng, lat]);
    ctx.beginPath();
    strokeOrthoPath(ctx, pts, centerLng, centerLat, cx, cy, radius * 0.98);
  }
  for (let lng = -180; lng <= 180; lng += 30) {
    const pts: [number, number][] = [];
    for (let lat = -80; lat <= 80; lat += 3) pts.push([lng, lat]);
    ctx.beginPath();
    strokeOrthoPath(ctx, pts, centerLng, centerLat, cx, cy, radius * 0.98);
  }
  ctx.restore();
}

/** Simplified land accents (grey masses) on the front hemisphere — reference print locator style. */
function drawLandMasses(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  centerLng: number,
  centerLat: number,
) {
  const blobs: { lng: number; lat: number; rx: number; ry: number; tone: string }[] = [
    { lng: -102, lat: 48, rx: 0.3, ry: 0.22, tone: '#c4c4c4' },
    { lng: -78, lat: 28, rx: 0.2, ry: 0.18, tone: '#d1d5db' },
    { lng: -62, lat: -8, rx: 0.24, ry: 0.3, tone: '#c4c4c4' },
    { lng: -42, lat: -52, rx: 0.14, ry: 0.16, tone: '#d1d5db' },
    { lng: 8, lat: 52, rx: 0.22, ry: 0.14, tone: '#c4c4c4' },
    { lng: 18, lat: 6, rx: 0.26, ry: 0.3, tone: '#b8b8b8' },
    { lng: 48, lat: 36, rx: 0.32, ry: 0.2, tone: '#c4c4c4' },
    { lng: 72, lat: 22, rx: 0.28, ry: 0.24, tone: '#d1d5db' },
    { lng: 98, lat: 38, rx: 0.34, ry: 0.22, tone: '#c4c4c4' },
    { lng: 128, lat: -18, rx: 0.18, ry: 0.14, tone: '#d1d5db' },
    { lng: 145, lat: -32, rx: 0.12, ry: 0.1, tone: '#c4c4c4' },
    { lng: -18, lat: 64, rx: 0.16, ry: 0.12, tone: '#d1d5db' },
    { lng: 22, lat: -28, rx: 0.2, ry: 0.22, tone: '#c4c4c4' },
  ];
  for (const b of blobs) {
    const c = siMapPrintOrthoProject(b.lng, b.lat, centerLng, centerLat, cx, cy, radius * 0.94);
    if (!c) continue;
    ctx.fillStyle = b.tone;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, radius * b.rx, radius * b.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Small coordinate marker (no AOI box on the globe). */
export function drawSiMapPrintGlobeCenterMarker(
  ctx: CanvasRenderingContext2D,
  view: SiMapPrintGlobeView,
) {
  const p = siMapPrintOrthoProject(
    view.markerLng,
    view.markerLat,
    view.centerLng,
    view.centerLat,
    view.cx,
    view.cy,
    view.radius * 0.96,
  );
  if (!p) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#166534';
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Transparent globe locator — orthographic disc only (no white panel).
 * White oceans, grey land, grey graticule, small dot at map center.
 */
export function drawSiMapPrintGlobeLocator(
  ctx: CanvasRenderingContext2D,
  rect: SiMapPrintRect,
  bounds: SiPdfLngLatBounds | null,
) {
  const view = siMapPrintGlobeView(rect, bounds);
  const { cx, cy, radius, centerLng, centerLat } = view;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  drawLandMasses(ctx, cx, cy, radius, centerLng, centerLat);
  drawGraticule(ctx, cx, cy, radius, centerLng, centerLat);
  drawSiMapPrintGlobeCenterMarker(ctx, view);

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
