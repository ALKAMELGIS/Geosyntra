/** Agro composite & delta indices for Sentinel Layer Live (evalscript-backed). */

export type AgroCompositeFormula =
  | 'vhs'
  | 'vdi'
  | 'cvi'
  | 'csi'
  | 'wst'
  | 'dri'
  | 'vmi'
  | 'smi'
  | 'oir'
  | 'iei'
  | 'uii'
  | 'fpr'
  | 'cpi'
  | 'gpi'
  | 'csi2'
  | 'cri'
  | 'vdg'
  | 'ari'
  | 'chs'
  | 'cps';

export type LayerLiveCompositeDef = {
  id: string;
  sciCode: string;
  title: string;
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  layerOrder: number;
  formula: AgroCompositeFormula;
  isDelta: boolean;
};

const G = {
  veg: '🌱 Vegetation Health',
  water: '💧 Water & Moisture',
  irrig: '🚜 Irrigation & Field Management',
  growth: '🌾 Growth & Stability',
  risk: '⚠️ Risk & Composite',
  vegDelta: '🌱 Vegetation Change Detection',
  waterDelta: '💧 Moisture & Water Change Detection',
  irrigDelta: '🚜 Irrigation & Field Change Detection',
  growthDelta: '🌾 Growth & Stability Change Detection',
  riskDelta: '⚠️ Risk & Composite Change Detection',
} as const;

function base(
  id: string,
  sciCode: string,
  title: string,
  groupKey: string,
  groupLabel: string,
  groupOrder: number,
  layerOrder: number,
  formula: AgroCompositeFormula,
): LayerLiveCompositeDef {
  return { id, sciCode, title, groupKey, groupLabel, groupOrder, layerOrder, formula, isDelta: false };
}

function delta(
  id: string,
  sciCode: string,
  title: string,
  groupKey: string,
  groupLabel: string,
  groupOrder: number,
  layerOrder: number,
  formula: AgroCompositeFormula,
): LayerLiveCompositeDef {
  return { id, sciCode, title, groupKey, groupLabel, groupOrder, layerOrder, formula, isDelta: true };
}

/** Ordered catalog — base indices then delta (change detection) blocks. */
export const SI_LAYER_LIVE_COMPOSITE_CATALOG: readonly LayerLiveCompositeDef[] = [
  base('VHS', 'VHS', 'Vegetation Health Score', 'veg', G.veg, 1, 1, 'vhs'),
  base('VDI', 'VDI', 'Vegetation Density Index', 'veg', G.veg, 1, 2, 'vdi'),
  base('CVI', 'CVI', 'Crop Vigor Index', 'veg', G.veg, 1, 3, 'cvi'),
  base('CSI', 'CSI', 'Crop Stress Index', 'veg', G.veg, 1, 4, 'csi'),
  base('WST', 'WST', 'Water Stress Index', 'veg', G.veg, 1, 5, 'wst'),

  base('DRI', 'DRI', 'Drought Risk Index', 'water', G.water, 2, 1, 'dri'),
  base('VMI', 'VMI', 'Vegetation Moisture Index', 'water', G.water, 2, 2, 'vmi'),
  base('SMI', 'SMI', 'Soil Moisture Index Proxy', 'water', G.water, 2, 3, 'smi'),
  base('OIR', 'OIR', 'Over Irrigation Risk', 'water', G.water, 2, 4, 'oir'),

  base('IEI', 'IEI', 'Irrigation Efficiency Index', 'irrig', G.irrig, 3, 1, 'iei'),
  base('UII', 'UII', 'Under Irrigation Index', 'irrig', G.irrig, 3, 2, 'uii'),
  base('FPR', 'FPR', 'Field Priority Risk', 'irrig', G.irrig, 3, 3, 'fpr'),
  base('CPI', 'CPI', 'Crop Performance Index', 'irrig', G.irrig, 3, 4, 'cpi'),

  base('GPI', 'GPI', 'Growth Potential Index', 'growth', G.growth, 4, 1, 'gpi'),
  base('CSI2', 'CSI2', 'Crop Stability Index', 'growth', G.growth, 4, 2, 'csi2'),
  base('CRI', 'CRI', 'Crop Recovery Index', 'growth', G.growth, 4, 3, 'cri'),
  base('VDG', 'VDG', 'Vegetation Degradation Index', 'growth', G.growth, 4, 4, 'vdg'),

  base('ARI', 'ARI', 'Agricultural Risk Index', 'risk', G.risk, 5, 1, 'ari'),
  base('CHS', 'CHS', 'Composite Health Score', 'risk', G.risk, 5, 2, 'chs'),
  base('CPS', 'CPS', 'Crop Priority Score', 'risk', G.risk, 5, 3, 'cps'),

  delta('DELTA_VHS', 'ΔVHS', 'Vegetation Health Score Change', 'veg_delta', G.vegDelta, 6, 1, 'vhs'),
  delta('DELTA_VDI', 'ΔVDI', 'Vegetation Density Change', 'veg_delta', G.vegDelta, 6, 2, 'vdi'),
  delta('DELTA_CVI', 'ΔCVI', 'Crop Vigor Change', 'veg_delta', G.vegDelta, 6, 3, 'cvi'),
  delta('DELTA_CSI', 'ΔCSI', 'Crop Stress Change', 'veg_delta', G.vegDelta, 6, 4, 'csi'),
  delta('DELTA_WST', 'ΔWST', 'Water Stress Change', 'veg_delta', G.vegDelta, 6, 5, 'wst'),

  delta('DELTA_DRI', 'ΔDRI', 'Drought Risk Change', 'water_delta', G.waterDelta, 7, 1, 'dri'),
  delta('DELTA_VMI', 'ΔVMI', 'Vegetation Moisture Change', 'water_delta', G.waterDelta, 7, 2, 'vmi'),
  delta('DELTA_SMI', 'ΔSMI', 'Soil Moisture Change', 'water_delta', G.waterDelta, 7, 3, 'smi'),
  delta('DELTA_OIR', 'ΔOIR', 'Over Irrigation Risk Change', 'water_delta', G.waterDelta, 7, 4, 'oir'),

  delta('DELTA_IEI', 'ΔIEI', 'Irrigation Efficiency Change', 'irrig_delta', G.irrigDelta, 8, 1, 'iei'),
  delta('DELTA_UII', 'ΔUII', 'Under Irrigation Change', 'irrig_delta', G.irrigDelta, 8, 2, 'uii'),
  delta('DELTA_FPR', 'ΔFPR', 'Field Priority Change', 'irrig_delta', G.irrigDelta, 8, 3, 'fpr'),
  delta('DELTA_CPI', 'ΔCPI', 'Crop Performance Change', 'irrig_delta', G.irrigDelta, 8, 4, 'cpi'),

  delta('DELTA_GPI', 'ΔGPI', 'Growth Potential Change', 'growth_delta', G.growthDelta, 9, 1, 'gpi'),
  delta('DELTA_CSI2', 'ΔCSI2', 'Crop Stability Change', 'growth_delta', G.growthDelta, 9, 2, 'csi2'),
  delta('DELTA_CRI', 'ΔCRI', 'Crop Recovery Change', 'growth_delta', G.growthDelta, 9, 3, 'cri'),
  delta('DELTA_VDG', 'ΔVDG', 'Vegetation Degradation Change', 'growth_delta', G.growthDelta, 9, 4, 'vdg'),

  delta('DELTA_ARI', 'ΔARI', 'Agricultural Risk Change', 'risk_delta', G.riskDelta, 10, 1, 'ari'),
  delta('DELTA_CHS', 'ΔCHS', 'Composite Health Change', 'risk_delta', G.riskDelta, 10, 2, 'chs'),
  delta('DELTA_CPS', 'ΔCPS', 'Crop Priority Change', 'risk_delta', G.riskDelta, 10, 3, 'cps'),
];

const CATALOG_BY_ID = new Map(
  SI_LAYER_LIVE_COMPOSITE_CATALOG.map(d => [d.id.toUpperCase(), d] as const),
);

export function getLayerLiveCompositeDef(layerId: string): LayerLiveCompositeDef | null {
  return CATALOG_BY_ID.get(String(layerId || '').trim().toUpperCase()) ?? null;
}

export function isLayerLiveCompositeLayerId(layerId: string): boolean {
  return CATALOG_BY_ID.has(String(layerId || '').trim().toUpperCase());
}

export type LayerLiveIndexSelectOption = {
  id: string;
  /** Full layer name — shown on hover only. */
  title: string;
  /** Short code shown in the picker (abbreviation). */
  abbr: string;
  layerOrder?: number;
};

const LAYER_LIVE_INDEX_CODES = [
  'NDVI',
  'NDMI',
  'NDWI',
  'EVI',
  'SAVI',
  'GNDVI',
  'NDSI',
  'NDRE',
  'LST',
  'NDBI',
  'MNDWI',
] as const;

/** Compact label for Layer Live UI; full `title` is reserved for tooltips. */
export function resolveLayerLiveAbbr(
  id: string,
  label: string,
): { abbr: string; title: string } {
  const lid = String(id || '').trim();
  const lab = String(label || '').trim();
  const idU = lid.toUpperCase();
  const labU = lab.toUpperCase();
  const title = [lab, lid].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ') || lid || lab;

  if (labU && labU.length <= 10 && !/\s/.test(lab)) {
    return { abbr: labU, title };
  }

  for (const code of LAYER_LIVE_INDEX_CODES) {
    if (labU === code || idU === code) return { abbr: code, title };
    if (new RegExp(`(^|[_-])${code}([_-]|$)`).test(idU)) return { abbr: code, title };
  }

  if (lab && /\s/.test(lab)) {
    const words = lab
      .replace(/[()]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0 && !/^(and|or|the|of)$/i.test(w));
    if (words.length >= 2) {
      const acr = words
        .map(w => w[0])
        .join('')
        .toUpperCase();
      if (acr.length >= 2 && acr.length <= 8) return { abbr: acr, title };
    }
    if (words[0] && words[0].length <= 10) return { abbr: words[0]!.toUpperCase(), title };
  }

  const segments = lid.split(/[_-]+/).filter(s => s.length > 0 && !/^\d+$/.test(s));
  if (segments.length === 1 && segments[0]!.length <= 12) {
    return { abbr: segments[0]!.toUpperCase(), title };
  }
  if (segments.length >= 2) {
    const tail = segments
      .slice(-2)
      .map(s => (s.length <= 4 ? s : s.slice(0, 4)))
      .join('-')
      .toUpperCase();
    if (tail.length <= 12) return { abbr: tail, title };
  }

  if (lid.length <= 10) return { abbr: idU, title };
  return { abbr: idU.slice(0, 8), title };
}

export type LayerLiveIndexSelectGroup = {
  key: string;
  label: string;
  order: number;
  options: LayerLiveIndexSelectOption[];
};

/** Group API + composite options for Layer Live pickers (preserves catalog order within composites). */
export function buildLayerLiveIndexSelectGroups(
  apiOptions: Array<{ id: string; label: string }>,
  compositeOptions: Array<{
    id: string;
    label: string;
    sciCode?: string;
    groupKey?: string;
    groupLabel?: string;
    groupOrder?: number;
    layerOrder?: number;
  }>,
): LayerLiveIndexSelectGroup[] {
  const sortOptions = (opts: LayerLiveIndexSelectOption[]) =>
    [...opts].sort((a, b) => (a.layerOrder ?? 999) - (b.layerOrder ?? 999));

  const groups: LayerLiveIndexSelectGroup[] = [];
  if (apiOptions.length) {
    groups.push({
      key: 'sentinel_api',
      label: 'Sentinel (API)',
      order: 0,
      options: apiOptions.map((o, i) => {
        const display = resolveLayerLiveAbbr(o.id, o.label);
        return {
          id: o.id,
          title: display.title,
          abbr: display.abbr,
          layerOrder: i,
        };
      }),
    });
  }

  const byGroup = new Map<string, LayerLiveIndexSelectGroup>();
  for (const o of compositeOptions) {
    const key = o.groupKey || 'composite';
    let g = byGroup.get(key);
    if (!g) {
      g = {
        key,
        label: o.groupLabel || 'Composite indices',
        order: o.groupOrder ?? 99,
        options: [],
      };
      byGroup.set(key, g);
    }
    g.options.push({
      id: o.id,
      title: o.label,
      abbr: o.sciCode || o.id,
      layerOrder: o.layerOrder,
    });
  }

  for (const g of byGroup.values()) {
    g.options = sortOptions(g.options);
  }

  groups.push(...[...byGroup.values()].sort((a, b) => a.order - b.order));
  return groups;
}
