import { inferWmsEvalProfile, type WmsAoiEvalProfile } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
} from '../../../lib/siWmsIndexClassificationRamp';

export type SiSymbologyClassificationMode = 'quantitative' | 'qualitative';

export type SiSymbologyRampPresetId = 'vegetation' | 'water' | 'thermal' | 'soil' | 'spectral' | 'greys';

export type SiWmsSymbologyUiState = {
  rampPreset: SiSymbologyRampPresetId;
  classificationType: SiSymbologyClassificationMode;
  numClasses: number;
  opacity01: number;
  autoScientific: boolean;
};

export const SI_WMS_SYMBOLOGY_DEFAULT_UI: SiWmsSymbologyUiState = {
  rampPreset: 'vegetation',
  classificationType: 'quantitative',
  numClasses: 10,
  opacity01: 1,
  autoScientific: true,
};

/** Sparse anchor ramps for WMS symbology (piecewise-linear in evalscript). */
export const SI_SYM_PRESET_STOPS: Record<SiSymbologyRampPresetId, readonly IndexRampStop[]> = {
  vegetation: [
    [-1, 0x0a0f0a],
    [-0.25, 0x3d3d3d],
    [0, 0xd6d6c3],
    [0.2, 0x9acd32],
    [0.45, 0x2e8b57],
    [0.7, 0x14532d],
    [1, 0x052e16],
  ],
  water: [
    [-1, 0x0a1a2e],
    [-0.2, 0x1e3a5f],
    [0.1, 0x93c5fd],
    [0.45, 0x2563eb],
    [0.75, 0x1d4ed8],
    [1, 0x0f172a],
  ],
  thermal: [
    [-1, 0x1a0a2e],
    [-0.2, 0x312e81],
    [0.15, 0xfde047],
    [0.45, 0xf97316],
    [0.75, 0xea580c],
    [1, 0x7f1d1d],
  ],
  soil: [
    [-1, 0x0c0a08],
    [-0.2, 0x57534e],
    [0.1, 0xa8a29e],
    [0.35, 0xb45309],
    [0.65, 0x92400e],
    [1, 0x431407],
  ],
  spectral: [
    [-1, 0x5e4fa2],
    [-0.5, 0x3288bd],
    [0, 0x93c5fd],
    [0.25, 0xeab308],
    [0.55, 0xf97316],
    [0.8, 0xd7191c],
    [1, 0x7a0177],
  ],
  greys: [
    [-1, 0x0a0a0a],
    [-0.5, 0x404040],
    [0, 0x9ca3af],
    [0.5, 0xd1d5db],
    [1, 0xf8fafc],
  ],
};

export function siWmsSymbologySupportsLayer(layerName: string): boolean {
  const p = inferWmsEvalProfile(layerName);
  return (
    p === 'ndvi' ||
    p === 'ndwi' ||
    p === 'gndvi' ||
    p === 'ndmi' ||
    p === 'evi' ||
    p === 'savi' ||
    p === 'ndbi' ||
    p === 'lst'
  );
}

export function siWmsDefaultStopsForProfile(profile: WmsAoiEvalProfile): readonly IndexRampStop[] | null {
  switch (profile) {
    case 'ndvi':
      return SI_NDVI_CLASSIFICATION_STOPS;
    case 'ndwi':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'gndvi':
      return SI_GNDVI_CLASSIFICATION_STOPS;
    case 'ndmi':
      return SI_NDMI_CLASSIFICATION_STOPS;
    case 'evi':
      return SI_EVI_CLASSIFICATION_STOPS;
    case 'savi':
      return SI_NDVI_CLASSIFICATION_STOPS;
    case 'ndbi':
      return SI_NDWI_CLASSIFICATION_STOPS;
    case 'lst':
      return SI_NDMI_CLASSIFICATION_STOPS;
    default:
      return null;
  }
}

export function siAutoRampPresetForLayerName(layerName: string): SiSymbologyRampPresetId {
  const u = String(layerName || '').toUpperCase();
  if (u.includes('NDWI') || u.includes('MNDWI') || u.includes('WATER')) return 'water';
  if (u.includes('LST') || u.includes('TEMP') || u.includes('THERMAL')) return 'thermal';
  if (u.includes('BSI') || u.includes('SOIL') || u.includes('SAR')) return 'soil';
  if (u.includes('SAVI')) return 'vegetation';
  if (u.includes('NDBI') || u.includes('URBAN') || u.includes('BUILT')) return 'soil';
  if (u.includes('NDVI') || u.includes('GNDVI') || u.includes('EVI')) return 'vegetation';
  return 'vegetation';
}

function unpackRgb(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return [r, g, b];
}

function packRgb(r: number, g: number, b: number): number {
  const R = Math.max(0, Math.min(255, Math.round(r * 255)));
  const G = Math.max(0, Math.min(255, Math.round(g * 255)));
  const B = Math.max(0, Math.min(255, Math.round(b * 255)));
  return (R << 16) | (G << 8) | B;
}

function sampleStops(t: number, stops: readonly IndexRampStop[]): [number, number, number] {
  const n = stops.length;
  if (n === 0) return [0, 0, 0];
  if (t <= stops[0]![0]) return unpackRgb(stops[0]![1]);
  if (t >= stops[n - 1]![0]) return unpackRgb(stops[n - 1]![1]);
  for (let i = 1; i < n; i++) {
    const t1 = stops[i]![0];
    if (t <= t1) {
      const t0 = stops[i - 1]![0];
      const c0 = unpackRgb(stops[i - 1]![1]);
      const c1 = unpackRgb(stops[i]![1]);
      const f = (t - t0) / (t1 - t0 + 1e-12);
      const u = Math.max(0, Math.min(1, f));
      return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
    }
  }
  return unpackRgb(stops[n - 1]![1]);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

function buildQualitativeStops(tMin: number, tMax: number, n: number): IndexRampStop[] {
  const k = Math.max(3, Math.min(16, Math.round(n)));
  const out: IndexRampStop[] = [];
  for (let i = 0; i < k; i++) {
    const u = k <= 1 ? 0 : i / (k - 1);
    const t = tMin + (tMax - tMin) * u;
    const hue = 260 - u * 260;
    const [r, g, b] = hslToRgb(hue, 0.55, 0.48);
    out.push([t, packRgb(r, g, b)]);
  }
  return out;
}

function buildQuantitativeStops(domain: readonly IndexRampStop[], preset: readonly IndexRampStop[], n: number): IndexRampStop[] {
  const k = Math.max(3, Math.min(16, Math.round(n)));
  const t0d = domain[0]![0];
  const t1d = domain[domain.length - 1]![0];
  const t0p = preset[0]![0];
  const t1p = preset[preset.length - 1]![0];
  const spanD = t1d - t0d || 1;
  const spanP = t1p - t0p || 1;
  const out: IndexRampStop[] = [];
  for (let i = 0; i < k; i++) {
    const u = k <= 1 ? 0 : i / (k - 1);
    const t = t0d + spanD * u;
    const tp = t0p + spanP * u;
    const [r, g, b] = sampleStops(tp, preset);
    out.push([t, packRgb(r, g, b)]);
  }
  return out;
}

export function siComputeSymbologyStops(layerName: string, ui: SiWmsSymbologyUiState): readonly IndexRampStop[] | null {
  if (!siWmsSymbologySupportsLayer(layerName)) return null;
  const profile = inferWmsEvalProfile(layerName);
  const base = siWmsDefaultStopsForProfile(profile);
  if (!base?.length) return null;
  const tMin = base[0]![0];
  const tMax = base[base.length - 1]![0];
  const effectivePreset: SiSymbologyRampPresetId = ui.autoScientific
    ? siAutoRampPresetForLayerName(layerName)
    : ui.rampPreset;
  const ramp = SI_SYM_PRESET_STOPS[effectivePreset];
  const classCount = Number.isFinite(ui.numClasses) ? ui.numClasses : SI_WMS_SYMBOLOGY_DEFAULT_UI.numClasses;
  const k = Math.max(3, Math.min(16, Math.round(classCount)));
  if (ui.classificationType === 'qualitative') {
    return buildQualitativeStops(tMin, tMax, k);
  }
  /** N classes ⇒ N+1 thresholds so legend shows N intervals matching map ramp. */
  return buildQuantitativeStops(base, ramp, k + 1);
}

export function siSymbologyRampLabels(): { id: SiSymbologyRampPresetId; label: string }[] {
  return [
    { id: 'vegetation', label: 'Vegetation (green)' },
    { id: 'water', label: 'Water (blue)' },
    { id: 'thermal', label: 'Thermal (heat)' },
    { id: 'soil', label: 'Soil / bare' },
    { id: 'spectral', label: 'Spectral (diverging)' },
    { id: 'greys', label: 'Greyscale' },
  ];
}
