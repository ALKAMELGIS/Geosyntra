import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  SI_SAVI_CLASSIFICATION_STOPS,
  siSampleRampColorAt,
} from '../../../lib/siWmsIndexClassificationRamp';

const PREVIEW_SIZE = 160;

/**
 * Classic RS NDVI preview ramp: water (blue) → stressed (red) → yellow → dense green.
 * Matches standard Earth Observation NDVI composites.
 */
const NDVI_RS_PREVIEW_STOPS: readonly IndexRampStop[] = [
  [-0.4, 0x0c4a6e],
  [-0.2, 0x0369a1],
  [-0.08, 0x22d3ee],
  [0, 0xcd5c5c],
  [0.08, 0xdc2626],
  [0.18, 0xd97706],
  [0.28, 0xeab308],
  [0.38, 0xa3e635],
  [0.5, 0x4ade80],
  [0.62, 0x22c55e],
  [0.75, 0x15803d],
  [0.9, 0x14532d],
] as const;

export type ExploreIndexPreviewScene =
  | 'ndvi'
  | 'ndwi'
  | 'ndmi'
  | 'evi'
  | 'savi'
  | 'fire'
  | 'snow'
  | 'urban'
  | 'forest'
  | 'generic';

const previewCache = new Map<string, string>();

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

/** Quantize to simulate Sentinel-2 10 m pixel blocks in the thumbnail. */
function snapSentinelPixel(nx: number, ny: number, block = 0.014): [number, number] {
  const bx = Math.floor(nx / block) * block + block * 0.5;
  const by = Math.floor(ny / block) * block + block * 0.5;
  return [bx, by];
}

function inRotatedRect(
  nx: number,
  ny: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
): boolean {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = nx - cx;
  const dy = ny - cy;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return Math.abs(lx) <= w * 0.5 && Math.abs(ly) <= h * 0.5;
}

/**
 * Agricultural mosaic: irregular parcels, pivot irrigation, reservoir, tracks, fallow.
 * Values are true NDVI from simulated Red/NIR reflectance (B04/B08).
 */
export function sampleNdviAgricultureIndex(nx: number, ny: number): number {
  [nx, ny] = snapSentinelPixel(nx, ny);

  const reservoir = Math.hypot(nx - 0.34, ny - 0.6);
  if (reservoir < 0.09) return -0.28 - hash2(nx * 140, ny * 140) * 0.1;
  if (reservoir < 0.12) return -0.06 + hash2(nx * 80, ny * 80) * 0.05;

  const stream = Math.abs(ny - (0.72 + Math.sin(nx * 8.5) * 0.04));
  if (stream < 0.018) return -0.18 + hash2(nx * 110, ny * 110) * 0.06;

  const pivotDist = Math.hypot(nx - 0.64, ny - 0.35);
  if (pivotDist < 0.15) {
    const rings = Math.sin(pivotDist * 52) * 0.04;
    return clamp(0.52 + rings + (hash2(nx * 95, ny * 95) - 0.5) * 0.06, 0.2, 0.88);
  }

  if (inRotatedRect(nx, ny, 0.22, 0.28, 0.34, 0.22, -0.35)) {
    const row = Math.sin(ny * 180) * 0.025;
    return clamp(0.58 + row + (hash2(nx * 160, ny * 160) - 0.5) * 0.05, 0.35, 0.82);
  }

  if (inRotatedRect(nx, ny, 0.78, 0.22, 0.28, 0.3, 0.2)) {
    return clamp(0.44 + (hash2(nx * 120, ny * 120) - 0.5) * 0.08, 0.22, 0.68);
  }

  if (inRotatedRect(nx, ny, 0.5, 0.78, 0.38, 0.24, 0.05)) {
    return clamp(0.31 + (hash2(nx * 88, ny * 88) - 0.5) * 0.07, 0.12, 0.52);
  }

  const parcel = Math.floor(nx * 6) + Math.floor(ny * 5) * 7;
  const bases = [0.18, 0.29, 0.37, 0.48, 0.56, 0.63, 0.41, 0.33, 0.69, 0.52, 0.24, 0.45];
  const base = bases[parcel % bases.length]!;

  const fx = (nx * 6) % 1;
  const fy = (ny * 5) % 1;
  if (fx < 0.03 || fy < 0.03 || fx > 0.97 || fy > 0.97) {
    return 0.05 + hash2(nx * 220, ny * 220) * 0.06;
  }

  if (nx > 0.84 && ny < 0.2) return 0.08 + hash2(nx * 60, ny * 60) * 0.07;

  const texture =
    Math.sin(ny * 125 + parcel * 0.4) * 0.03 +
    Math.cos(nx * 108 + parcel * 0.3) * 0.025 +
    (hash2(nx * 190 + parcel, ny * 190 + parcel) - 0.5) * 0.045;

  const ndvi = clamp(base + texture, -0.35, 0.92);
  return ndviFromReflectance(simulateRedNirFromNdvi(ndvi, nx, ny));
}

function simulateRedNirFromNdvi(targetNdvi: number, nx: number, ny: number): { red: number; nir: number } {
  const sum = 0.58 + hash2(nx * 44, ny * 44) * 0.18;
  const nir = (sum * (1 + targetNdvi)) / 2;
  const red = sum - nir;
  const noise = (hash2(nx * 300, ny * 300) - 0.5) * 0.018;
  return { red: clamp(red + noise, 0.03, 0.5), nir: clamp(nir - noise * 0.5, 0.06, 0.62) };
}

function ndviFromReflectance(bands: { red: number; nir: number }): number {
  const { red, nir } = bands;
  return (nir - red) / (nir + red + 1e-6);
}

export function sampleNdwiWaterIndex(nx: number, ny: number): number {
  [nx, ny] = snapSentinelPixel(nx, ny, 0.016);
  const lake = Math.hypot(nx - 0.45, ny - 0.5);
  if (lake < 0.22) return 0.35 + (0.22 - lake) * 1.2 + hash2(nx * 90, ny * 90) * 0.08;
  const river = Math.abs(ny - (0.35 + Math.sin(nx * 6) * 0.08));
  if (river < 0.025) return 0.28 + hash2(nx * 120, ny * 120) * 0.06;
  return -0.15 + hash2(nx * 40, ny * 40) * 0.25;
}

export function sampleNdmiMoistureIndex(nx: number, ny: number): number {
  const wet = sampleNdviAgricultureIndex(nx, ny);
  return clamp(wet * 0.55 - 0.05 + hash2(nx * 70, ny * 70) * 0.08, -0.5, 0.85);
}

export function sampleBurnScarIndex(nx: number, ny: number): number {
  [nx, ny] = snapSentinelPixel(nx, ny);
  const burn = Math.hypot(nx - 0.55, ny - 0.45);
  if (burn < 0.18) return -0.35 + hash2(nx * 100, ny * 100) * 0.1;
  return sampleNdviAgricultureIndex(nx, ny) * 0.7 + 0.1;
}

export function sampleSnowCloudIndex(nx: number, ny: number): number {
  const cloud = hash2(nx * 12, ny * 12);
  if (cloud > 0.72) return 0.85;
  const veg = sampleNdviAgricultureIndex(nx, ny);
  return veg > 0.4 ? veg * 0.3 - 0.2 : -0.4 + hash2(nx * 50, ny * 50) * 0.15;
}

export function resolveExploreIndexScene(bandId: string): ExploreIndexPreviewScene {
  const id = bandId.toLowerCase();
  if (id.includes('ndwi') || id.includes('land-water') || id.includes('water')) return 'ndwi';
  if (id.includes('ndmi') || id.includes('swir') || id.includes('moisture')) return 'ndmi';
  if (id.includes('evi') || id.includes('gci') || id.includes('sipi') || id.includes('arvi')) return 'evi';
  if (id.includes('savi')) return 'savi';
  if (id.includes('fire')) return 'fire';
  if (id.includes('snow') || id.includes('ndsi') || id.includes('cloud')) return 'snow';
  if (id.includes('urban') || id.includes('false-color-urban')) return 'urban';
  if (id.includes('forest') || id.includes('deforest') || id.includes('forestry')) return 'forest';
  if (id.includes('ndvi') || id.includes('agriculture') || id.includes('vegetation') || id.includes('healthy')) {
    return 'ndvi';
  }
  return 'generic';
}

function resolveStops(scene: ExploreIndexPreviewScene): readonly IndexRampStop[] {
  switch (scene) {
    case 'ndwi':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'ndmi':
      return SI_NDMI_CLASSIFICATION_STOPS;
    case 'evi':
      return SI_EVI_CLASSIFICATION_STOPS;
    case 'savi':
      return SI_SAVI_CLASSIFICATION_STOPS;
    case 'fire':
      return [
        [-0.5, 0x1c1917],
        [-0.2, 0x7f1d1d],
        [0, 0xdc2626],
        [0.3, 0xf97316],
        [0.6, 0xfbbf24],
        [1, 0x292524],
      ] as const;
    case 'snow':
      return [
        [-0.5, 0x334155],
        [0, 0x94a3b8],
        [0.4, 0xe2e8f0],
        [0.7, 0xf8fafc],
        [1, 0xffffff],
      ] as const;
    case 'urban':
      return [
        [-0.5, 0x14532d],
        [0, 0x9ca3af],
        [0.35, 0x6b7280],
        [0.65, 0xa855f7],
        [1, 0x831843],
      ] as const;
    case 'forest':
      return SI_GNDVI_CLASSIFICATION_STOPS;
    case 'ndvi':
      return NDVI_RS_PREVIEW_STOPS;
    default:
      return SI_NDVI_CLASSIFICATION_STOPS;
  }
}

function sampleIndex(scene: ExploreIndexPreviewScene, nx: number, ny: number): number {
  switch (scene) {
    case 'ndwi':
      return sampleNdwiWaterIndex(nx, ny);
    case 'ndmi':
      return sampleNdmiMoistureIndex(nx, ny);
    case 'evi':
      return sampleNdviAgricultureIndex(nx, ny) * 0.95 + 0.02;
    case 'savi':
      return sampleNdviAgricultureIndex(nx, ny) * 0.88;
    case 'fire':
      return sampleBurnScarIndex(nx, ny);
    case 'snow':
      return sampleSnowCloudIndex(nx, ny);
    case 'urban':
      return sampleNdviAgricultureIndex(nx, ny) * 0.4 - 0.15;
    case 'forest':
      return clamp(sampleNdviAgricultureIndex(nx, ny) + 0.12, -0.3, 0.95);
    case 'ndvi':
    case 'generic':
    default:
      return sampleNdviAgricultureIndex(nx, ny);
  }
}

function renderIndexRaster(
  scene: ExploreIndexPreviewScene,
  size: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(size * size * 4);
  const stops = resolveStops(scene);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / size;
      const ny = y / size;
      const idx = sampleIndex(scene, nx, ny);
      const hex = siSampleRampColorAt(stops, idx);
      const [r, g, b] = hexToRgb(hex);
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }

  return { data, width: size, height: size };
}

export function buildExploreIndexPreviewPixels(
  bandId: string,
  size = PREVIEW_SIZE,
): Uint8ClampedArray {
  const scene = resolveExploreIndexScene(bandId);
  return renderIndexRaster(scene, size).data;
}

/** Paint classified index raster directly to a 2D canvas context. */
export function paintExploreIndexPreviewToCanvas(
  ctx: CanvasRenderingContext2D,
  bandId: string,
  size = PREVIEW_SIZE,
): void {
  const scene = resolveExploreIndexScene(bandId);
  const { data, width, height } = renderIndexRaster(scene, size);
  const imageData = new ImageData(data, width, height);
  ctx.putImageData(imageData, 0, 0);
}

/** Raster preview PNG data URL from classified pixel values (cached per band id). */
export function buildExploreIndexPreviewDataUrl(bandId: string): string | null {
  const cached = previewCache.get(bandId);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  paintExploreIndexPreviewToCanvas(ctx, bandId, PREVIEW_SIZE);
  const url = canvas.toDataURL('image/png');
  previewCache.set(bandId, url);
  return url;
}

export function resetExploreIndexPreviewCacheForTests(): void {
  previewCache.clear();
}

export const SI_EXPLORE_INDEX_PREVIEW_SIZE = PREVIEW_SIZE;
