import type { SiCropTypeId } from './siCropHealthTypes';
import type { SiCropHealthWeatherContext } from './siCropHealthTypes';
import { cropHealthWeatherStress } from './siCropHealthWeather';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normIndex(id: string, v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  switch (id) {
    case 'NDVI':
    case 'EVI':
    case 'SAVI':
      return clamp01((v + 0.05) / 0.85);
    case 'NDMI':
      return clamp01((v + 0.35) / 0.7);
    default:
      return clamp01(v);
  }
}

function cropNdviBaseline(crop: SiCropTypeId): number {
  switch (crop) {
    case 'rice':
      return 0.62;
    case 'corn':
      return 0.58;
    case 'wheat':
      return 0.52;
    case 'cotton':
      return 0.48;
    case 'alfalfa':
      return 0.55;
    case 'vegetables':
      return 0.6;
    default:
      return 0.55;
  }
}

export type SiCropHealthStressInputs = {
  ndvi: number;
  evi: number;
  savi: number;
  ndmi?: number;
  ndviDelta: number;
  crop: SiCropTypeId;
  weather: SiCropHealthWeatherContext;
  useNdviTemporal: boolean;
  useNdmi: boolean;
  useWeather: boolean;
};

export type SiCropHealthStressBreakdown = {
  vigor: number;
  moisture: number;
  temperatureStress: number;
  temporalStress: number;
  healthScore: number;
  stressIndex: number;
};

/**
 * Multi-factor crop stress model (Sentinel-2 indices + weather inside AOI).
 * healthScore ∈ [0,1] (1 = best); stressIndex = 1 − healthScore.
 */
export function computeCropHealthStressModel(input: SiCropHealthStressInputs): SiCropHealthStressBreakdown {
  const base = cropNdviBaseline(input.crop);
  const ndviN = normIndex('NDVI', input.ndvi);
  const eviN = normIndex('EVI', input.evi);
  const saviN = normIndex('SAVI', input.savi);
  const vigorRaw = ndviN * 0.45 + eviN * 0.3 + saviN * 0.25;
  const vigor = clamp01(vigorRaw / Math.max(0.35, base / 0.85));

  const ndmiN =
    input.useNdmi && input.ndmi != null && Number.isFinite(input.ndmi)
      ? normIndex('NDMI', input.ndmi)
      : null;
  const soilFromWeather = clamp01(input.weather.soilMoisturePct / 100);
  const moisture =
    ndmiN != null ? clamp01(ndmiN * 0.65 + soilFromWeather * 0.35) : soilFromWeather;

  const temperatureStress = input.useWeather ? cropHealthWeatherStress(input.weather) : 0;
  const temporalStress = input.useNdviTemporal
    ? clamp01(Math.max(0, -input.ndviDelta) * 2.4)
    : 0;

  const healthScore = clamp01(
    vigor * 0.42 +
      moisture * 0.22 +
      (1 - temperatureStress) * 0.18 +
      (1 - temporalStress) * 0.18,
  );
  const stressIndex = clamp01(1 - healthScore);

  return {
    vigor,
    moisture,
    temperatureStress,
    temporalStress,
    healthScore,
    stressIndex,
  };
}

/** Spectral ramp: low stress (teal/green) → high stress (orange/red). */
export function stressIndexToRgb(stressIndex: number): [number, number, number] {
  const t = clamp01(stressIndex);
  const stops: Array<{ t: number; c: [number, number, number] }> = [
    { t: 0, c: [13, 148, 136] },
    { t: 0.22, c: [34, 197, 94] },
    { t: 0.45, c: [132, 204, 22] },
    { t: 0.62, c: [234, 179, 8] },
    { t: 0.78, c: [249, 115, 22] },
    { t: 1, c: [239, 68, 68] },
  ];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return [
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * u),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * u),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * u),
      ];
    }
  }
  return stops[stops.length - 1]!.c;
}

export function stressIndexToHex(stressIndex: number): string {
  const [r, g, b] = stressIndexToRgb(stressIndex);
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}
