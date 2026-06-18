import type { Map as MapboxMap } from 'mapbox-gl';

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('snapshot image decode failed'));
    img.src = src;
  });
}

export function collectAoiRings(geom: GeoJSON.Geometry): number[][][] {
  const rings: number[][][] = [];
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) rings.push(ring as number[][]);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      for (const ring of poly) rings.push(ring as number[][]);
    }
  }
  return rings;
}

export type SiAoiProjectedRing = { x: number; y: number }[];

/**
 * Mapbox `map.project` returns CSS pixels; the WebGL canvas backing store is
 * `clientWidth × devicePixelRatio`. Snapshot PNGs must scale lng/lat → pixels
 * with `outputImageWidth / clientWidth` (not `outputWidth / canvas.width`).
 */
export function snapshotImagePixelScale(
  map: MapboxMap,
  outputImageWidth: number,
  outputImageHeight: number,
): { scaleX: number; scaleY: number } {
  const canvas = map.getCanvas();
  const container = map.getContainer();
  const cssW = container?.clientWidth || canvas?.clientWidth || outputImageWidth || 1;
  const cssH = container?.clientHeight || canvas?.clientHeight || outputImageHeight || 1;
  return {
    scaleX: outputImageWidth / Math.max(1, cssW),
    scaleY: outputImageHeight / Math.max(1, cssH),
  };
}

function projectRing(
  map: MapboxMap,
  ring: number[][],
  scaleX: number,
  scaleY: number,
): SiAoiProjectedRing {
  return ring.map(([lng, lat]) => {
    const p = map.project([lng, lat]);
    return { x: p.x * scaleX, y: p.y * scaleY };
  });
}

/** Project AOI rings once while the map is frozen — avoids outline drift during async capture. */
export function projectAoiRingsForSnapshot(
  map: MapboxMap,
  aoiFeature: GeoJSON.Feature,
  outputImageWidth?: number,
  outputImageHeight?: number,
): SiAoiProjectedRing[] {
  const geom = aoiFeature.geometry;
  if (!geom) return [];
  const rings = collectAoiRings(geom);
  const canvas = map.getCanvas();
  const mapW = canvas.width;
  const mapH = canvas.height;
  if (!mapW || !mapH) return [];
  const targetW = outputImageWidth ?? mapW;
  const targetH = outputImageHeight ?? mapH;
  const { scaleX, scaleY } = snapshotImagePixelScale(map, targetW, targetH);
  return rings.map(ring => projectRing(map, ring, scaleX, scaleY));
}

function traceRingPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (!pts.length) return;
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

/** Fit the live viewer to AOI bounds before raster capture (no animation). */
export function fitMapToLngLatBounds(
  map: MapboxMap,
  fit: [[number, number], [number, number]],
  padding = 52,
): void {
  map.fitBounds(fit, { padding, duration: 0, maxZoom: 16, animate: false });
}

/**
 * Clip a Mapbox canvas snapshot to the AOI polygon so WMS tiles outside the AOI are hidden.
 * Uses the same projection as the map at capture time.
 */
export async function clipMapSnapshotToAoiFeature(
  map: MapboxMap,
  pngDataUrl: string,
  aoiFeature: GeoJSON.Feature,
  opts?: {
    outlineColor?: string;
    outsideFill?: string;
    /** Pre-projected rings at capture scale — do not call `map.project` again. */
    projectedRings?: SiAoiProjectedRing[];
    /** AOI outline is already painted on the map canvas — skip second stroke. */
    skipOutlineStroke?: boolean;
    imageScale?: number;
  },
): Promise<string> {
  const geom = aoiFeature.geometry;
  if (!geom) return pngDataUrl;
  const rings = collectAoiRings(geom);
  if (!rings.length) return pngDataUrl;

  try {
    const img = await loadImageElement(pngDataUrl);
    const canvas = map.getCanvas();
    const mapW = canvas.width;
    const mapH = canvas.height;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    if (!mapW || !mapH || !imgW || !imgH) return pngDataUrl;

    const { scaleX, scaleY } = snapshotImagePixelScale(map, imgW, imgH);
    const projected =
      opts?.projectedRings ?? rings.map(ring => projectRing(map, ring, scaleX, scaleY));

    const c = document.createElement('canvas');
    c.width = imgW;
    c.height = imgH;
    const ctx = c.getContext('2d');
    if (!ctx) return pngDataUrl;

    ctx.fillStyle = opts?.outsideFill ?? '#020617';
    ctx.fillRect(0, 0, imgW, imgH);

    ctx.save();
    ctx.beginPath();
    for (const pts of projected) {
      traceRingPath(ctx, pts);
    }
    ctx.clip('evenodd');
    ctx.drawImage(img, 0, 0, imgW, imgH);
    ctx.restore();

    if (!opts?.skipOutlineStroke) {
      const outline = opts?.outlineColor ?? 'rgba(34, 197, 94, 0.95)';
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(2, Math.round(imgW * 0.0035));
      ctx.lineJoin = 'round';
      for (const pts of projected) {
        if (!pts.length) continue;
        ctx.beginPath();
        traceRingPath(ctx, pts);
        ctx.stroke();
      }
    }

    return c.toDataURL('image/png');
  } catch {
    return pngDataUrl;
  }
}

/** Full-frame snapshot with AOI outline only (basemap + index visible everywhere). */
export async function outlineAoiOnSnapshotPng(
  pngDataUrl: string,
  projectedRings: SiAoiProjectedRing[],
  opts?: { outlineColor?: string },
): Promise<string> {
  if (!projectedRings.length) return pngDataUrl;
  try {
    const img = await loadImageElement(pngDataUrl);
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = imgW;
    c.height = imgH;
    const ctx = c.getContext('2d');
    if (!ctx) return pngDataUrl;
    ctx.drawImage(img, 0, 0, imgW, imgH);
    const outline = opts?.outlineColor ?? 'rgba(34, 197, 94, 0.95)';
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(2, Math.round(imgW * 0.0035));
    ctx.lineJoin = 'round';
    for (const pts of projectedRings) {
      if (!pts.length) continue;
      ctx.beginPath();
      traceRingPath(ctx, pts);
      ctx.stroke();
    }
    return c.toDataURL('image/png');
  } catch {
    return pngDataUrl;
  }
}
