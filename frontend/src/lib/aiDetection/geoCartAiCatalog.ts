import type { AiModelInfo } from './types';

export type GeoCartAiModelPreset = {
  id: string;
  label: string;
  category: 'building' | 'landcover' | 'infrastructure' | 'object' | 'segmentation';
  resolution: string;
  bands: string;
  gpuPreferred: boolean;
  keywords: string[];
  hint: string;
};

export const GEO_CART_AI_MODEL_PRESETS: GeoCartAiModelPreset[] = [
  {
    id: 'building-usa',
    label: 'Building Extraction (USA)',
    category: 'building',
    resolution: '0.3 – 0.5 m/px (High-Res)',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['building', 'usa', 'footprint', 'structure'],
    hint: 'Footprints from high-resolution RGB over US urban areas.',
  },
  {
    id: 'building-africa',
    label: 'Building Extraction (Africa)',
    category: 'building',
    resolution: '0.3 – 0.5 m/px (High-Res)',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['building', 'africa', 'footprint'],
    hint: 'Regional building extraction tuned for African settlements.',
  },
  {
    id: 'landcover-hr',
    label: 'Land Cover Classification (High-Res)',
    category: 'landcover',
    resolution: '0.5 – 2 m/px',
    bands: '4+ Bands (RGB+NIR)',
    gpuPreferred: true,
    keywords: ['landcover', 'land cover', 'classification', 'high'],
    hint: 'Semantic land-cover classes from high-resolution multispectral imagery.',
  },
  {
    id: 'landcover-landsat',
    label: 'Land Cover Classification (Landsat)',
    category: 'landcover',
    resolution: '30 m/px',
    bands: 'Multispectral (Landsat 8/9)',
    gpuPreferred: true,
    keywords: ['landcover', 'landsat', 'classification'],
    hint: 'Broad-area land cover from Landsat-scale stacks.',
  },
  {
    id: 'roads-global',
    label: 'Global Road Extraction',
    category: 'infrastructure',
    resolution: '0.5 – 1 m/px',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['road', 'linear', 'transport'],
    hint: 'Centerlines and polygons for road networks worldwide.',
  },
  {
    id: 'palm-trees',
    label: 'Palm Tree Detection',
    category: 'object',
    resolution: '0.1 – 0.3 m/px',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['palm', 'tree', 'agriculture'],
    hint: 'Individual palm crown detection for plantation analytics.',
  },
  {
    id: 'wind-turbines',
    label: 'Wind Turbine Detection',
    category: 'infrastructure',
    resolution: '0.3 – 0.6 m/px',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['wind', 'turbine', 'energy'],
    hint: 'Wind turbine asset detection for renewable energy sites.',
  },
  {
    id: 'cars-ships',
    label: 'Car & Ship Detection',
    category: 'object',
    resolution: '0.3 – 0.5 m/px',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['car', 'ship', 'vehicle', 'vessel'],
    hint: 'Vehicles and vessels for maritime and urban monitoring.',
  },
  {
    id: 'text-sam',
    label: 'Text-SAM (Segment Anything)',
    category: 'segmentation',
    resolution: 'Any (prompt-guided)',
    bands: '3 Bands (RGB)',
    gpuPreferred: true,
    keywords: ['sam', 'segment', 'text', 'prompt'],
    hint: 'Prompt-driven segmentation masks from natural language.',
  },
];

export function resolveGeoCartPreset(id: string): GeoCartAiModelPreset | undefined {
  return GEO_CART_AI_MODEL_PRESETS.find(p => p.id === id);
}

/** Match registered API model to a catalog preset (name/id keyword overlap). */
export function matchGeoCartPresetToModel(
  preset: GeoCartAiModelPreset,
  models: AiModelInfo[],
): AiModelInfo | null {
  if (!models.length) return null;
  const keys = preset.keywords.map(k => k.toLowerCase());
  let best: AiModelInfo | null = null;
  let bestScore = 0;
  for (const m of models) {
    const hay = `${m.id} ${m.name} ${m.model_type} ${m.file_name}`.toLowerCase();
    let score = 0;
    for (const k of keys) {
      if (hay.includes(k)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return bestScore > 0 ? best : null;
}
