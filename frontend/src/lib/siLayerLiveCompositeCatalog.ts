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
  | 'cci'
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

/** Ordered catalog — agro composite indices (no change-detection / delta layers in Layer Live). */
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

  base('CHS', 'CHS', 'Composite Health Score', 'risk', G.risk, 5, 1, 'chs'),
  base('CCI', 'CCI', 'Composite Crop Index', 'risk', G.risk, 5, 2, 'cci'),
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
  /** Full layer name — shown on hover and inline in parentheses. */
  title: string;
  /** Short code shown in the picker (abbreviation). */
  abbr: string;
  /** Scientific / descriptive name — rendered as small text in parentheses. */
  sciName?: string;
  layerOrder?: number;
  /** Vegetation Health dashboard accent — unique per-index scientific color. */
  accentColor?: string;
};

/** Vegetation Health — unique scientific accent per index (no shared palette). */
export const LAYER_LIVE_VEGETATION_HEALTH_ACCENT_COLORS: Readonly<Record<string, string>> = {
  VHS: '#0B3D2E',
  VDI: '#1F7A4C',
  CVI: '#FFD400',
  CSI: '#FF4D4D',
  WST: '#2D6BFF',
} as const;

export function resolveLayerLiveVegetationHealthAccentColor(layerId: string): string | undefined {
  return LAYER_LIVE_VEGETATION_HEALTH_ACCENT_COLORS[String(layerId || '').trim().toUpperCase()];
}

function withOptionAccent(option: LayerLiveIndexSelectOption): LayerLiveIndexSelectOption {
  const accentColor = resolveLayerLiveVegetationHealthAccentColor(option.id);
  return accentColor ? { ...option, accentColor } : option;
}

/** Canonical scientific names for core spectral indices. */
export const LAYER_LIVE_CORE_SCIENTIFIC_NAMES: Record<string, string> = {
  NDVI: 'Normalized Difference Vegetation Index',
  NDWI: 'Normalized Difference Water Index',
  NDMI: 'Normalized Difference Moisture Index',
  EVI: 'Enhanced Vegetation Index',
  GNDVI: 'Green Normalized Difference Vegetation Index',
  SAVI: 'Soil-Adjusted Vegetation Index',
  NDRE: 'Normalized Difference Red Edge',
  NDSI: 'Normalized Difference Snow Index',
  LST: 'Land Surface Temperature',
  NDBI: 'Normalized Difference Built-up Index',
  MNDWI: 'Modified Normalized Difference Water Index',
};

/** Resolve inline scientific label for Layer Live picker rows. */
export function resolveLayerLiveScientificName(abbr: string, title?: string): string | null {
  const code = String(abbr || '').trim();
  if (!code) return null;

  const mapped = LAYER_LIVE_CORE_SCIENTIFIC_NAMES[code.toUpperCase()];
  if (mapped) return mapped;

  const raw = String(title || '').trim();
  if (!raw) return null;

  const cleaned = raw.split('·').map(s => s.trim()).find(part => part.length > 0) ?? raw;
  if (!cleaned || cleaned.toUpperCase() === code.toUpperCase()) return null;
  if (/^[\sA-Z0-9Δ-]+$/i.test(cleaned) && cleaned.length <= 12 && !/\s/.test(cleaned)) return null;

  return cleaned;
}

function withSciName(
  entry: Omit<LayerLiveIndexSelectOption, 'sciName'>,
  sciNameSource?: string,
): LayerLiveIndexSelectOption {
  const sciName =
    resolveLayerLiveScientificName(entry.abbr, sciNameSource ?? entry.title) ?? undefined;
  return sciName ? { ...entry, sciName } : entry;
}

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

/** Main Core group — primary spectral indices shown first in Layer Live pickers. */
export const SI_LAYER_LIVE_CORE_GROUP = {
  key: 'core',
  label: '📊 Core indices',
  order: 0,
} as const;

/** Canonical sort order for Core indices (vegetation → water → moisture → …). */
export const SI_LAYER_LIVE_CORE_INDEX_ORDER = [
  'NDVI',
  'NDWI',
  'NDMI',
  'EVI',
  'GNDVI',
  'SAVI',
  'NDRE',
  'NDSI',
  'LST',
  'NDBI',
  'MNDWI',
] as const;

const CORE_INDEX_SET = new Set<string>(SI_LAYER_LIVE_CORE_INDEX_ORDER);

function coreIndexSortRank(abbr: string): number {
  const idx = SI_LAYER_LIVE_CORE_INDEX_ORDER.indexOf(
    abbr.toUpperCase() as (typeof SI_LAYER_LIVE_CORE_INDEX_ORDER)[number],
  );
  return idx >= 0 ? idx : 999;
}

/** True when a WMS / eval layer is a primary spectral index (NDVI, NDWI, …). */
export function isLayerLiveCoreIndex(id: string, label: string): boolean {
  const display = resolveLayerLiveAbbr(id, label);
  const abbrU = display.abbr.toUpperCase();
  if (CORE_INDEX_SET.has(abbrU)) return true;
  const idU = String(id || '').trim().toUpperCase();
  const labU = String(label || '').trim().toUpperCase();
  for (const code of SI_LAYER_LIVE_CORE_INDEX_ORDER) {
    if (idU === code || labU === code) return true;
    if (new RegExp(`(^|[_-])${code}([_-]|$)`).test(idU)) return true;
  }
  return false;
}

function dedupeOptionsByAbbr(options: LayerLiveIndexSelectOption[]): LayerLiveIndexSelectOption[] {
  const seen = new Set<string>();
  const out: LayerLiveIndexSelectOption[] = [];
  for (const o of options) {
    const key = o.abbr.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/** Group API + composite options for Layer Live pickers (Core first, composites, then other API). */
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

  const coreOptions: LayerLiveIndexSelectOption[] = [];
  const apiOther: LayerLiveIndexSelectOption[] = [];

  for (const o of apiOptions) {
    const display = resolveLayerLiveAbbr(o.id, o.label);
    const entry = withSciName({
      id: o.id,
      title: display.title,
      abbr: display.abbr,
      layerOrder: coreIndexSortRank(display.abbr),
    });
    if (isLayerLiveCoreIndex(o.id, o.label)) {
      coreOptions.push(entry);
    } else {
      apiOther.push({ ...entry, layerOrder: apiOther.length });
    }
  }

  const byGroup = new Map<string, LayerLiveIndexSelectGroup>();
  for (const o of compositeOptions) {
    const gKey = o.groupKey || 'composite';

    if (gKey === SI_LAYER_LIVE_CORE_GROUP.key) {
      coreOptions.push(
        withSciName(
          {
            id: o.id,
            title: o.label,
            abbr: o.sciCode || o.id,
            layerOrder: coreIndexSortRank(o.sciCode || o.id),
          },
          o.label,
        ),
      );
      continue;
    }

    let g = byGroup.get(gKey);
    if (!g) {
      g = {
        key: gKey,
        label: o.groupLabel || 'Composite indices',
        order: o.groupOrder ?? 99,
        options: [],
      };
      byGroup.set(gKey, g);
    }
    g.options.push(
      withOptionAccent(
        withSciName(
          {
            id: o.id,
            title: o.label,
            abbr: o.sciCode || o.id,
            layerOrder: o.layerOrder,
          },
          o.label,
        ),
      ),
    );
  }

  for (const g of byGroup.values()) {
    g.options = sortOptions(g.options);
  }

  const groups: LayerLiveIndexSelectGroup[] = [];

  const coreSorted = sortOptions(dedupeOptionsByAbbr(coreOptions));
  if (coreSorted.length) {
    groups.push({
      key: SI_LAYER_LIVE_CORE_GROUP.key,
      label: SI_LAYER_LIVE_CORE_GROUP.label,
      order: SI_LAYER_LIVE_CORE_GROUP.order,
      options: coreSorted,
    });
  }

  groups.push(...[...byGroup.values()].sort((a, b) => a.order - b.order));

  const apiDeduped = dedupeOptionsByAbbr(apiOther);
  if (apiDeduped.length) {
    groups.push({
      key: 'sentinel_api',
      label: '🛰️ Sentinel (API)',
      order: 50,
      options: apiDeduped,
    });
  }

  return groups;
}

/** Remove picker rows whose layer id cannot render on the Map Canvas WMS stack. */
export function filterLayerLiveIndexSelectGroupsForMapCanvas(
  groups: readonly LayerLiveIndexSelectGroup[],
  supportedLayerIds: ReadonlySet<string>,
): LayerLiveIndexSelectGroup[] {
  return groups
    .map(g => ({
      ...g,
      options: g.options.filter(o => supportedLayerIds.has(o.id)),
    }))
    .filter(g => g.options.length > 0);
}
