import type { Feature, FeatureCollection } from 'geojson';
import type { SiAoiRasterPixelSample } from './siAoiZonalStats';
import { geometryAoiAreaHectares, getFeatureLngLatBounds } from './siAoiZonalStats';
import { cropHealthWeatherStress } from './siCropHealthWeather';
import type { WeeklyCompositeLite } from './staticAoiChartTypes';
import type {
  RunSiCropHealthAnalysisInput,
  SiCropHealthAnalysisResult,
  SiCropHealthCell,
  SiCropHealthCondition,
  SiCropHealthHotspot,
  SiCropHealthSeverity,
  SiCropHealthTrendPoint,
  SiCropTypeId,
} from './siCropHealthTypes';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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

function classifyCondition(score: number): SiCropHealthCondition {
  if (score >= 0.72) return 'healthy';
  if (score >= 0.52) return 'stress';
  if (score >= 0.35) return 'early_disease';
  return 'disease_active';
}

function classifySeverity(score: number): SiCropHealthSeverity {
  if (score >= 0.65) return 'low';
  if (score >= 0.42) return 'medium';
  return 'high';
}

/** Weighted GeoAI ensemble (heuristic RF-style) — no server ML dependency. */
function ensembleCropHealthScore(opts: {
  ndvi: number;
  evi: number;
  savi: number;
  ndviDelta: number;
  ndmi?: number;
  weatherStress: number;
  crop: SiCropTypeId;
  useNdvi: boolean;
  useAi: boolean;
}): number {
  const base = cropNdviBaseline(opts.crop);
  const vigor = clamp01((opts.ndvi * 0.45 + opts.evi * 0.3 + opts.savi * 0.25) / Math.max(0.35, base));
  const deltaPenalty = opts.useNdvi ? clamp01(Math.max(0, -opts.ndviDelta) * 2.2) : 0;
  const moistureBonus =
    opts.ndmi != null && Number.isFinite(opts.ndmi) ? clamp01((opts.ndmi + 0.2) * 0.35) : 0;
  const weatherPenalty = opts.useAi ? opts.weatherStress * 0.35 : 0;
  const raw = vigor * 0.55 + moistureBonus * 0.12 - deltaPenalty * 0.28 - weatherPenalty;
  return clamp01(raw);
}

function ndviWeeklyDelta(composites: readonly WeeklyCompositeLite[]): number {
  if (composites.length < 2) return 0;
  const sorted = [...composites].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const last = sorted[sorted.length - 1]?.mean ?? 0;
  const prev = sorted[sorted.length - 2]?.mean ?? last;
  return last - prev;
}

export function buildSiCropHealthTrend(
  composites: readonly WeeklyCompositeLite[],
  anchorStressPct: number,
): SiCropHealthTrendPoint[] {
  const sorted = [...composites].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const tail = sorted.slice(-8);
  return tail.map((w, i) => {
    const delta = i > 0 ? w.mean - (tail[i - 1]?.mean ?? w.mean) : 0;
    const stressPct = Math.max(0, Math.min(100, anchorStressPct + (-delta * 120)));
    const diseasePct = Math.max(0, Math.min(100, stressPct * 0.55));
    return {
      weekEndIso: w.endDate.slice(0, 10),
      meanNdvi: w.mean,
      stressPct,
      diseasePct,
    };
  });
}

function clusterHotspots(cells: SiCropHealthCell[]): SiCropHealthHotspot[] {
  const risky = cells.filter(c => c.condition === 'early_disease' || c.condition === 'disease_active');
  if (!risky.length) return [];
  const clusters: SiCropHealthCell[][] = [];
  const used = new Set<number>();
  const distDeg = 0.00035;
  for (let i = 0; i < risky.length; i += 1) {
    if (used.has(i)) continue;
    const group = [risky[i]!];
    used.add(i);
    for (let j = i + 1; j < risky.length; j += 1) {
      if (used.has(j)) continue;
      const a = risky[i]!;
      const b = risky[j]!;
      if (Math.hypot(a.lng - b.lng, a.lat - b.lat) < distDeg) {
        group.push(b);
        used.add(j);
      }
    }
    clusters.push(group);
  }
  return clusters.slice(0, 12).map((g, idx) => {
    const lng = g.reduce((s, c) => s + c.lng, 0) / g.length;
    const lat = g.reduce((s, c) => s + c.lat, 0) / g.length;
    const meanNdvi = g.reduce((s, c) => s + c.ndvi, 0) / g.length;
    const worst = g.reduce((w, c) => (c.score < w.score ? c : w), g[0]!);
    return {
      id: `hotspot-${idx}`,
      lng,
      lat,
      radiusM: Math.min(180, 40 + g.length * 8),
      condition: worst.condition,
      severity: worst.severity,
      pixelCount: g.length,
      meanNdvi,
    };
  });
}

export function runSiCropHealthAnalysis(
  raster: SiAoiRasterPixelSample,
  input: RunSiCropHealthAnalysisInput & {
    aoiId: string;
    aoiName: string;
    feature: Feature;
  },
): SiCropHealthAnalysisResult | null {
  const grid = raster.grid;
  const ndviArr = raster.layers.NDVI ?? [];
  const eviArr = raster.layers.EVI ?? [];
  const saviArr = raster.layers.SAVI ?? [];
  const ndmiArr = raster.layers.NDMI;
  const n = Math.min(grid.length, ndviArr.length, eviArr.length, saviArr.length);
  if (n < 4) return null;

  const ndviDeltaAoi = input.ndviAnalysisEnabled ? ndviWeeklyDelta(input.weeklyComposites) : 0;
  const weatherStress = cropHealthWeatherStress(input.weather);
  const cells: SiCropHealthCell[] = [];

  for (let i = 0; i < n; i += 1) {
    const pt = grid[i]!;
    const ndvi = Number(ndviArr[i]);
    const evi = Number(eviArr[i]);
    const savi = Number(saviArr[i]);
    if (![ndvi, evi, savi].every(Number.isFinite)) continue;
    const localDelta = input.ndviAnalysisEnabled ? ndvi - (ndviArr.reduce((a, b) => a + b, 0) / n) + ndviDeltaAoi : 0;
    const ndmi = ndmiArr?.[i];
    const score = ensembleCropHealthScore({
      ndvi,
      evi,
      savi,
      ndviDelta: localDelta,
      ndmi: input.useSoilMoistureIndex && Number.isFinite(ndmi) ? Number(ndmi) : undefined,
      weatherStress,
      crop: input.cropType,
      useNdvi: input.ndviAnalysisEnabled,
      useAi: input.aiDiseaseEnabled,
    });
    cells.push({
      lng: pt.lng,
      lat: pt.lat,
      ndvi,
      evi,
      savi,
      ndviDelta: localDelta,
      score,
      condition: classifyCondition(score),
      severity: classifySeverity(score),
    });
  }

  if (cells.length < 4) return null;

  const areaHa = raster.areaHa > 0 ? raster.areaHa : geometryAoiAreaHectares(input.feature.geometry);
  const cellAreaHa = areaHa / cells.length;
  const summary: SiCropHealthAnalysisResult['summary'] = {
    healthy: { count: 0, pct: 0, areaHa: 0 },
    stress: { count: 0, pct: 0, areaHa: 0 },
    early_disease: { count: 0, pct: 0, areaHa: 0 },
    disease_active: { count: 0, pct: 0, areaHa: 0 },
  };
  for (const c of cells) {
    summary[c.condition].count += 1;
    summary[c.condition].areaHa += cellAreaHa;
  }
  for (const k of Object.keys(summary) as SiCropHealthCondition[]) {
    summary[k].pct = (summary[k].count / cells.length) * 100;
  }

  const ndviMean = cells.reduce((s, c) => s + c.ndvi, 0) / cells.length;
  const stressPct = ((summary.stress.count + summary.early_disease.count + summary.disease_active.count) / cells.length) * 100;
  const trend = buildSiCropHealthTrend(input.weeklyComposites, stressPct);
  const hotspots = clusterHotspots(cells);

  return {
    analyzedAtIso: new Date().toISOString(),
    aoiId: input.aoiId,
    aoiName: input.aoiName,
    cropType: input.cropType,
    areaHa,
    cellCount: cells.length,
    modelLabel: input.aiDiseaseEnabled
      ? 'GeoAI ensemble (NDVI·EVI·SAVI + weather fusion)'
      : 'NDVI temporal analysis',
    ndviMean,
    ndviDeltaWeek: ndviDeltaAoi,
    weatherStress,
    summary,
    cells,
    hotspots,
    trend,
    indicesUsed: ['NDVI', 'EVI', 'SAVI', ...(ndmiArr ? (['NDMI'] as const) : [])],
  };
}

export function cropHealthHotspotsToGeoJson(hotspots: SiCropHealthHotspot[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: hotspots.map(h => ({
      type: 'Feature',
      properties: {
        id: h.id,
        condition: h.condition,
        severity: h.severity,
        meanNdvi: h.meanNdvi,
        pixels: h.pixelCount,
      },
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
    })),
  };
}

export function featureCentroid(feature: Feature): { lat: number; lng: number } | null {
  const b = getFeatureLngLatBounds(feature);
  if (!b) return null;
  return { lng: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
}
