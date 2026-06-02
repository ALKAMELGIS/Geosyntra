import type { SiCropTypeId } from './siCropHealthTypes';
import { SI_CROP_TYPE_OPTIONS } from './siCropHealthTypes';

export type SiAoiInferredCrop = {
  id: SiCropTypeId;
  label: string;
  matchedToken: string;
};

type CropKeyword = { id: SiCropTypeId; patterns: RegExp[] };

/** Match crop type only when the AOI *name* contains a crop keyword (EN / AR). */
const AOI_CROP_KEYWORDS: CropKeyword[] = [
  {
    id: 'wheat',
    patterns: [/\bwheat\b/i, /(?:^|\s)قمح(?:\s|$)/u, /(?:^|\s)حنطة(?:\s|$)/u, /قمح/u],
  },
  {
    id: 'corn',
    patterns: [/\bcorn\b/i, /\bmaize\b/i, /(?:^|\s)ذرة(?:\s|$)/u, /ذرة/u],
  },
  {
    id: 'rice',
    patterns: [/\brice\b/i, /(?:^|\s)أ?رز(?:\s|$)/u, /(?:^|\s)ارز(?:\s|$)/u, /أ?رز/u],
  },
  {
    id: 'cotton',
    patterns: [/\bcotton\b/i, /(?:^|\s)قطن(?:\s|$)/u, /قطن/u],
  },
  {
    id: 'alfalfa',
    patterns: [/\balfalfa\b/i, /\blucerne\b/i, /(?:^|\s)برسيم(?:\s|$)/u, /برسيم/u, /(?:^|\s)فصة(?:\s|$)/u],
  },
  {
    id: 'vegetables',
    patterns: [
      /\bvegetable?s\b/i,
      /\btomato(?:es)?\b/i,
      /\bpotato(?:es)?\b/i,
      /\bcucumber?s\b/i,
      /\bpepper?s\b/i,
      /(?:^|\s)خض(?:ار|رة)(?:\s|$)/u,
      /طماطم/u,
      /بطاط(?:س|ا)/u,
      /خيار/u,
      /فلفل/u,
    ],
  },
];

const CROP_LABEL_BY_ID = Object.fromEntries(SI_CROP_TYPE_OPTIONS.map(o => [o.id, o.label])) as Record<
  SiCropTypeId,
  string
>;

type CropDiseaseProfile = {
  dry: string[];
  wet: string[];
  heat: string[];
  spectralStress: string[];
};

const CROP_DISEASE_PROFILES: Record<Exclude<SiCropTypeId, 'generic'>, CropDiseaseProfile> = {
  wheat: {
    dry: ['drought stress', 'powdery mildew (dry canopy pockets)'],
    wet: ['Septoria leaf blotch', 'stripe rust'],
    heat: ['heat stress', 'Fusarium head blight risk'],
    spectralStress: ['take-all root rot', 'yellow rust (early)'],
  },
  corn: {
    dry: ['drought stress', 'charcoal rot'],
    wet: ['gray leaf spot', 'northern corn leaf blight'],
    heat: ['heat stress', 'southern rust risk'],
    spectralStress: ['anthracnose leaf blight', 'stalk rot risk'],
  },
  rice: {
    dry: ['blast (moisture stress after dry spell)', 'drought-induced panicle blanking'],
    wet: ['sheath blight', 'bacterial leaf blight'],
    heat: ['heat stress at flowering', 'brown spot'],
    spectralStress: ['blast', 'tungro-like canopy decline'],
  },
  cotton: {
    dry: ['Verticillium wilt (soil moisture deficit)', 'drought stress'],
    wet: ['boll rot', 'Alternaria leaf spot'],
    heat: ['heat stress', 'square shedding'],
    spectralStress: ['Fusarium wilt', 'leaf curl complex'],
  },
  alfalfa: {
    dry: ['drought stress', 'spider mite pressure (dry canopy)'],
    wet: ['anthracnose', 'Phytophthora root rot'],
    heat: ['heat stress', 'summer dormancy stress'],
    spectralStress: ['root rot complex', 'leaf spot'],
  },
  vegetables: {
    dry: ['drought stress', 'powdery mildew (dry air pockets)'],
    wet: ['downy mildew', 'bacterial wilt'],
    heat: ['heat stress', 'blossom-end disorders'],
    spectralStress: ['early blight / leaf spot', 'nutrient stress masking as disease'],
  },
};

export type SiAoiCropDiseaseContext = {
  ndviMean: number | null;
  ndmiMean: number | null;
  lstMeanC: number | null;
  soilMoisturePct: number | null;
  heatRiskLabel: string;
  stressedAreaPct: number;
  liveLayerLabel: string | null;
};

export type SiAoiCropDiseaseForecast = {
  crop: SiAoiInferredCrop;
  likelyDiseases: string[];
  drivers: string[];
  summary: string;
};

export function inferCropFromAoiName(aoiName: string): SiAoiInferredCrop | null {
  const name = String(aoiName ?? '').trim();
  if (!name) return null;
  for (const entry of AOI_CROP_KEYWORDS) {
    for (const pattern of entry.patterns) {
      const hit = name.match(pattern);
      if (hit?.[0]) {
        return {
          id: entry.id,
          label: CROP_LABEL_BY_ID[entry.id] ?? entry.id,
          matchedToken: hit[0],
        };
      }
    }
  }
  return null;
}

function pickDiseases(cropId: Exclude<SiCropTypeId, 'generic'>, ctx: SiAoiCropDiseaseContext): {
  diseases: string[];
  drivers: string[];
} {
  const profile = CROP_DISEASE_PROFILES[cropId];
  const diseases: string[] = [];
  const drivers: string[] = [];

  const dry =
    (ctx.ndmiMean != null && ctx.ndmiMean < -0.06) ||
    (ctx.soilMoisturePct != null && ctx.soilMoisturePct < 35);
  const wet = ctx.ndmiMean != null && ctx.ndmiMean > 0.12;
  const hot =
    ctx.heatRiskLabel === 'High' ||
    (ctx.lstMeanC != null && ctx.lstMeanC >= 32) ||
    ctx.heatRiskLabel === 'Moderate';
  const spectralStress =
    (ctx.ndviMean != null && ctx.ndviMean < 0.28) || ctx.stressedAreaPct >= 10;

  if (dry) {
    diseases.push(...profile.dry.slice(0, 2));
    const ndmiBit = ctx.ndmiMean != null ? `NDMI ~${ctx.ndmiMean.toFixed(2)}` : 'low canopy moisture';
    const soilBit =
      ctx.soilMoisturePct != null ? `soil moisture proxy ~${ctx.soilMoisturePct.toFixed(0)}%` : 'dry soil signal';
    drivers.push(`${ndmiBit} + ${soilBit}`);
  }
  if (wet && spectralStress) {
    diseases.push(...profile.wet.slice(0, 2));
    drivers.push(`elevated NDMI (~${ctx.ndmiMean!.toFixed(2)}) with stressed canopy (Live Index)`);
  }
  if (hot) {
    diseases.push(...profile.heat.slice(0, 2));
    drivers.push(
      ctx.lstMeanC != null
        ? `LST ~${ctx.lstMeanC.toFixed(1)}°C (${ctx.heatRiskLabel.toLowerCase()} heat risk)`
        : `${ctx.heatRiskLabel.toLowerCase()} thermal stress`,
    );
  }
  if (spectralStress && diseases.length < 2) {
    diseases.push(...profile.spectralStress.slice(0, 2));
    drivers.push(
      ctx.ndviMean != null
        ? `Live Index NDVI ~${ctx.ndviMean.toFixed(2)} on ~${ctx.stressedAreaPct.toFixed(0)}% stressed area`
        : `stressed canopy on ~${ctx.stressedAreaPct.toFixed(0)}% of the AOI`,
    );
  }

  const uniqueDiseases = [...new Set(diseases.map(d => d.trim()).filter(Boolean))].slice(0, 3);
  const uniqueDrivers = [...new Set(drivers.map(d => d.trim()).filter(Boolean))].slice(0, 2);

  if (!uniqueDiseases.length) {
    uniqueDiseases.push(...profile.spectralStress.slice(0, 2));
    uniqueDrivers.push('routine Live Index monitoring — no acute moisture or heat trigger');
  }

  return { diseases: uniqueDiseases, drivers: uniqueDrivers };
}

/** Crop-aware disease forecast — only when AOI name contains a crop keyword. */
export function buildCropDiseaseForecast(
  aoiName: string,
  ctx: SiAoiCropDiseaseContext,
): SiAoiCropDiseaseForecast | null {
  const crop = inferCropFromAoiName(aoiName);
  if (!crop || crop.id === 'generic') return null;

  const { diseases, drivers } = pickDiseases(crop.id as Exclude<SiCropTypeId, 'generic'>, ctx);
  const liveBit = ctx.liveLayerLabel ? `${ctx.liveLayerLabel} Live Index` : 'Live Index layers';
  const ndviBit = ctx.ndviMean != null ? `NDVI ~${ctx.ndviMean.toFixed(2)}` : 'NDVI';
  const ndmiBit = ctx.ndmiMean != null ? `NDMI ~${ctx.ndmiMean.toFixed(2)}` : 'NDMI';

  const summary =
    `For ${crop.label} (AOI name "${aoiName}"), ${liveBit} (${ndviBit}, ${ndmiBit}` +
    `${ctx.lstMeanC != null ? `, LST ~${ctx.lstMeanC.toFixed(1)}°C` : ''}) suggests scouting for ` +
    `${diseases.join(' / ')} — driven by ${drivers.join('; ')}.`;

  return { crop, likelyDiseases: diseases, drivers, summary };
}

export function appendCropDiseaseToTemporalForecast(
  temporalLine: string,
  aoiName: string,
  ctx: SiAoiCropDiseaseContext,
): string {
  const forecast = buildCropDiseaseForecast(aoiName, ctx);
  if (!forecast) return temporalLine;
  if (temporalLine.toLowerCase().includes(forecast.crop.label.toLowerCase())) return temporalLine;
  const base = temporalLine.replace(/\.\s*$/, '');
  return `${base}. Crop-specific note: ${forecast.summary}`;
}
