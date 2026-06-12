/** Sentinel-1 GRD — InSAR / SAR-derived Layer Live catalog (evalscript-backed). */

export const SENTINEL_1_GRD_COLLECTION_ID = 'sentinel-1-grd';

export type Sentinel1SarFormula =
  | 'vv_db'
  | 'vh_db'
  | 'bcr'
  | 'nbi'
  | 'rvi'
  | 'smi'
  | 'ssm'
  | 'vsm'
  | 'rsm'
  | 'sma'
  | 'sri'
  | 'rrp'
  | 'nrc'
  | 'dce'
  | 'rdi'
  | 'spp'
  | 'sci_soil'
  | 'scd'
  | 'lsdi'
  | 'ssi'
  | 'mdci'
  | 'hdi'
  | 'smri'
  | 'coh'
  | 'incoh'
  | 't_coh'
  | 's_coh'
  | 'phase_proxy'
  | 'w_phase_proxy'
  | 'u_phase_proxy'
  | 'd_phase_proxy'
  | 'los_disp'
  | 'defo'
  | 'v_disp'
  | 'h_disp'
  | 'cum_disp'
  | 'los_vel'
  | 'defo_vel'
  | 'v_ann'
  | 'ts_disp'
  | 'ps_density'
  | 'ds_change'
  | 'gmi'
  | 'dai'
  | 'sci_surface'
  | 'bsc'
  | 'acd'
  | 'fdi'
  | 'wdi'
  | 'wci'
  | 'sfi'
  | 'ldi'
  | 'cdi'
  | 'vv_drop'
  | 'vh_drop'
  | 'bcr_change'
  | 'rvi_change'
  | 'coh_drop'
  | 'ps_change';

export type Sentinel1TemporalKind = 'drop' | 'rise' | 'delta';

export type Sentinel1InsarLayerDef = {
  id: string;
  sciCode: string;
  title: string;
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  layerOrder: number;
  formula: Sentinel1SarFormula;
  /** Uses multi-date ORBIT mosaicking (change / velocity proxies). */
  temporal: boolean;
  /** How before/after samples combine when temporal=true (default: delta). */
  temporalKind?: Sentinel1TemporalKind;
};

const G = {
  deform: '🔵 Deformation Indicators (InSAR – Ground Movement)',
  coh: '🔵 Coherence Indicators (Interferometric Quality)',
  phase: '🔵 Phase-Based Indicators',
  change: '🔵 Change Detection & Motion Indicators',
  sm: '🌱 Soil Moisture (SAR-derived)',
  bs: '🌱 Backscatter Soil Signals',
  rough: '🌱 Surface Roughness',
  diel: '🌱 Dielectric Properties',
  soilChg: '🌱 Soil Change Detection',
  hybrid: '🌱 Hybrid Soil–Motion Indicators',
  floodIdx: '💧 Flood Detection Indices (SAR / InSAR-based)',
  floodRadar: '🔵 Radar Signal-Based Flood Indicators',
  floodInsar: '🔵 InSAR Change-Based Flood Signals',
} as const;

function L(
  id: string,
  sciCode: string,
  title: string,
  groupKey: string,
  groupLabel: string,
  groupOrder: number,
  layerOrder: number,
  formula: Sentinel1SarFormula,
  temporal = false,
  temporalKind?: Sentinel1TemporalKind,
): Sentinel1InsarLayerDef {
  return {
    id,
    sciCode,
    title,
    groupKey,
    groupLabel,
    groupOrder,
    layerOrder,
    formula,
    temporal,
    ...(temporal && temporalKind ? { temporalKind } : {}),
  };
}

/** Ordered Sentinel-1 GRD Layer Live catalog. */
export const SI_SENTINEL1_INSAR_LAYER_CATALOG: readonly Sentinel1InsarLayerDef[] = [
  L('LOS_DISP', 'LOS Disp', 'Line-of-Sight Displacement', 'deform', G.deform, 1, 1, 'los_disp'),
  L('DEFO', 'Defo', 'Ground Deformation', 'deform', G.deform, 1, 2, 'defo'),
  L('V_DISP', 'V-DISP', 'Vertical Displacement', 'deform', G.deform, 1, 3, 'v_disp'),
  L('H_DISP', 'H-DISP', 'Horizontal Displacement', 'deform', G.deform, 1, 4, 'h_disp'),
  L('CUM_DISP', 'Cum-Disp', 'Cumulative Displacement', 'deform', G.deform, 1, 5, 'cum_disp', true),
  L('LOS_VEL', 'LOS Vel', 'Line-of-Sight Velocity', 'deform', G.deform, 1, 6, 'los_vel', true),
  L('DEFO_VEL', 'Defo Vel', 'Deformation Velocity', 'deform', G.deform, 1, 7, 'defo_vel', true),
  L('V_ANN', 'V-Ann', 'Annual Velocity', 'deform', G.deform, 1, 8, 'v_ann', true),
  L('TS_DISP', 'TS Disp', 'Time Series Displacement', 'deform', G.deform, 1, 9, 'ts_disp', true),

  L('COH', 'COH', 'Coherence', 'coh', G.coh, 2, 1, 'coh'),
  L('INCOH', 'InCOH', 'Interferometric Coherence', 'coh', G.coh, 2, 2, 'incoh'),
  L('T_COH', 'T-COH', 'Temporal Coherence', 'coh', G.coh, 2, 3, 't_coh', true),
  L('S_COH', 'S-COH', 'Spatial Coherence', 'coh', G.coh, 2, 4, 's_coh'),

  L('IFG_PHASE', 'IFG Phase', 'Interferometric Phase', 'phase', G.phase, 3, 1, 'phase_proxy'),
  L('W_PHASE', 'W-Phase', 'Wrapped Phase', 'phase', G.phase, 3, 2, 'w_phase_proxy'),
  L('U_PHASE', 'U-Phase', 'Unwrapped Phase', 'phase', G.phase, 3, 3, 'u_phase_proxy'),
  L('D_PHASE', 'D-Phase', 'Differential Phase', 'phase', G.phase, 3, 4, 'd_phase_proxy', true),

  L('PS_DENSITY', 'PS Density', 'Persistent Scatterer Density', 'change', G.change, 4, 1, 'ps_density'),
  L('DS_CHANGE', 'DS Change', 'Distributed Scatterer Change', 'change', G.change, 4, 2, 'ds_change', true),
  L('GMI', 'GMI', 'Ground Motion Index', 'change', G.change, 4, 3, 'gmi'),
  L('DAI', 'DAI', 'Deformation Anomaly Index', 'change', G.change, 4, 4, 'dai'),
  L('SCI', 'SCI', 'Surface Change Index', 'change', G.change, 4, 5, 'sci_surface'),
  L('BSC', 'BSC', 'Backscatter Change', 'change', G.change, 4, 6, 'bsc', true),
  L('ACD', 'ACD', 'Amplitude Change Detection', 'change', G.change, 4, 7, 'acd', true),

  L('SMI', 'SMI', 'Soil Moisture Index (SAR-based)', 'sm', G.sm, 5, 1, 'smi'),
  L('SSM', 'SSM', 'Surface Soil Moisture', 'sm', G.sm, 5, 2, 'ssm'),
  L('VSM', 'VSM', 'Volumetric Soil Moisture', 'sm', G.sm, 5, 3, 'vsm'),
  L('RSM', 'RSM', 'Relative Soil Moisture', 'sm', G.sm, 5, 4, 'rsm'),
  L('SMA', 'SMA', 'Soil Moisture Anomaly', 'sm', G.sm, 5, 5, 'sma', true),

  L('SIG0_VV', 'σ⁰ VV', 'Backscatter Coefficient VV', 'bs', G.bs, 6, 1, 'vv_db'),
  L('SIG0_VH', 'σ⁰ VH', 'Backscatter Coefficient VH', 'bs', G.bs, 6, 2, 'vh_db'),
  L('BCR', 'BCR', 'Backscatter Ratio (VV/VH)', 'bs', G.bs, 6, 3, 'bcr'),
  L('NBI', 'NBI', 'Normalized Backscatter Index', 'bs', G.bs, 6, 4, 'nbi'),
  L('RVI', 'RVI', 'Radar Vegetation Index', 'bs', G.bs, 6, 5, 'rvi'),

  L('SRI', 'SRI', 'Surface Roughness Index', 'rough', G.rough, 7, 1, 'sri'),
  L('RRP', 'RRP', 'Radar Roughness Parameter', 'rough', G.rough, 7, 2, 'rrp'),
  L('NRC', 'NRC', 'Normalized Roughness Coefficient', 'rough', G.rough, 7, 3, 'nrc'),

  L('DCE', 'DCE', 'Dielectric Constant Estimation', 'diel', G.diel, 8, 1, 'dce'),
  L('RDI', 'RDI', 'Relative Dielectric Index', 'diel', G.diel, 8, 2, 'rdi'),
  L('SPP', 'SPP', 'Soil Permittivity Proxy', 'diel', G.diel, 8, 3, 'spp'),

  L('SCI_SOIL', 'SCI', 'Soil Change Index', 'soil_chg', G.soilChg, 9, 1, 'sci_soil', true),
  L('SCD', 'SCD', 'Surface Change Detection (SAR)', 'soil_chg', G.soilChg, 9, 2, 'scd', true),
  L('LSDI', 'LSDI', 'Land Surface Disturbance Index', 'soil_chg', G.soilChg, 9, 3, 'lsdi', true),
  L('SSI', 'SSI', 'Soil Stability Index', 'soil_chg', G.soilChg, 9, 4, 'ssi'),

  L('MDCI', 'MDCI', 'Moisture-Deformation Coupling Index', 'hybrid', G.hybrid, 10, 1, 'mdci'),
  L('HDI', 'HDI', 'Hydro-Deformation Index', 'hybrid', G.hybrid, 10, 2, 'hdi'),
  L('SMRI', 'SMRI', 'Soil Motion Response Index', 'hybrid', G.hybrid, 10, 3, 'smri'),

  /* Flood — unique layers only (BSC, NBI, T-COH, DS_CHANGE live in their original groups). */
  L('FDI', 'FDI', 'Flood Detection Index', 'flood_idx', G.floodIdx, 11, 1, 'fdi', true, 'rise'),
  L('WDI', 'WDI', 'Water Detection Index', 'flood_idx', G.floodIdx, 11, 2, 'wdi'),
  L('WCI', 'WCI', 'Water Change Index', 'flood_idx', G.floodIdx, 11, 3, 'wci', true, 'rise'),
  L('SFI', 'SFI', 'Surface Flood Index', 'flood_idx', G.floodIdx, 11, 4, 'sfi'),
  L('LDI', 'LDI', 'Land Inundation Index', 'flood_idx', G.floodIdx, 11, 5, 'ldi'),
  L('CDI', 'CDI', 'Change Detection Index (Before/After)', 'flood_idx', G.floodIdx, 11, 6, 'cdi', true, 'rise'),

  L('VV_DROP', 'σ⁰ VV Drop', 'VV Backscatter Decrease Signal', 'flood_radar', G.floodRadar, 12, 1, 'vv_drop', true, 'drop'),
  L('VH_DROP', 'σ⁰ VH Drop', 'VH Backscatter Decrease Signal', 'flood_radar', G.floodRadar, 12, 2, 'vh_drop', true, 'drop'),
  L(
    'BCR_CHG',
    'VV/VH Δ',
    'VV/VH Ratio Change',
    'flood_radar',
    G.floodRadar,
    12,
    3,
    'bcr_change',
    true,
    'delta',
  ),
  L('RVI_CHG', 'RVI Δ', 'Radar Vegetation Index Change', 'flood_radar', G.floodRadar, 12, 4, 'rvi_change', true, 'delta'),

  L('COH_DROP', 'COH Drop', 'Interferometric Coherence Reduction', 'flood_insar', G.floodInsar, 13, 1, 'coh_drop', true, 'drop'),
  L('PS_CHG', 'PS Δ', 'Persistent Scatterer Change', 'flood_insar', G.floodInsar, 13, 2, 'ps_change', true, 'delta'),
];

const CATALOG_BY_ID = new Map(
  SI_SENTINEL1_INSAR_LAYER_CATALOG.map(d => [d.id.toUpperCase(), d] as const),
);

export function isSentinel1GrdCollection(collectionId: string): boolean {
  return String(collectionId || '').trim() === SENTINEL_1_GRD_COLLECTION_ID;
}

export function isSentinel1InsarLayerId(layerId: string): boolean {
  return CATALOG_BY_ID.has(String(layerId || '').trim().toUpperCase());
}

export function getSentinel1InsarLayerDef(layerId: string): Sentinel1InsarLayerDef | null {
  return CATALOG_BY_ID.get(String(layerId || '').trim().toUpperCase()) ?? null;
}

/**
 * Dual-pol Sentinel-1 GRD base layer for OGC WMS + custom evalscript (VV+VH bands).
 * VH-anchored IW-DV products expose both polarizations; VV-only layers reject VH in evalscript.
 */
export const SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK = 'IW-DV-VH-LINEAR-GAMMA0-ORTHORECTIFIED';

const SI_S1_WMS_TILE_LAYER_PREFER = [
  SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK,
  'ENHANCED-VISUALIZATION-ORTHORECTIFIED-VV-VH',
  '8_RGB-RATIO-VV-VH',
] as const;

function scoreSentinel1GrdWmsTileLayer(name: string): number {
  const u = String(name || '').trim().toUpperCase();
  if (!u) return 99;
  if (u.includes('SAR-URBAN') || u.includes('HH-HV') || u.includes('HH_HV')) return 90;
  if (u === SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK) return 0;
  if (u.includes('IW-DV-VH') && u.includes('LINEAR')) return 1;
  if (u.includes('IW-DV-VH')) return 2;
  if (u.includes('VV-VH') && u.includes('ORTHORECTIFIED')) return 3;
  if (u.includes('VV-VH')) return 4;
  if (u.includes('IW-DV-VV')) return 20;
  if (u.includes('SAR')) return 8;
  return 50;
}

/** Pick a WMS `LAYERS=` name that supports VV+VH evalscripts on the Public Data instance. */
/**
 * HH-HV native S1 WMS layers return empty transparent tiles on the public Hub instance.
 * When a VV-VH sibling exists, route GetMap through it so RGB composites (e.g. SAR Urban) render.
 */
export function resolveSentinel1NativeWmsTileLayerName(
  layerName: string,
  wmsLayers: readonly { name: string }[],
): string {
  const name = String(layerName || '').trim();
  if (!name || !/HH[-_]HV/i.test(name)) return name;
  const vvVhName = name.replace(/HH[-_]HV/gi, 'VV-VH');
  const hit = wmsLayers.find(l => String(l.name || '').trim().toUpperCase() === vvVhName.toUpperCase());
  return hit?.name?.trim() || name;
}

/** Drop HH-HV native layers when an equivalent VV-VH layer is listed in GetCapabilities. */
export function filterRedundantSentinel1HhHvWmsLayers<T extends { name: string }>(
  layers: readonly T[],
): T[] {
  const byUpper = new Set(layers.map(l => String(l.name || '').trim().toUpperCase()).filter(Boolean));
  return layers.filter(l => {
    const n = String(l.name || '').trim();
    const u = n.toUpperCase();
    if (!u.includes('HH-HV') && !u.includes('HH_HV')) return true;
    const vv = n.replace(/HH[-_]HV/gi, 'VV-VH').toUpperCase();
    return !byUpper.has(vv);
  });
}

export function resolveSentinel1GrdWmsTileLayerName(
  wmsLayers: readonly { name: string }[],
): string {
  const names = wmsLayers.map(l => String(l.name || '').trim()).filter(Boolean);
  const byUpper = new Map(names.map(n => [n.toUpperCase(), n] as const));

  for (const prefer of SI_S1_WMS_TILE_LAYER_PREFER) {
    const hit = byUpper.get(prefer.toUpperCase());
    if (hit) return hit;
  }

  const ranked = names
    .filter(n => scoreSentinel1GrdWmsTileLayer(n) < 20)
    .sort((a, b) => scoreSentinel1GrdWmsTileLayer(a) - scoreSentinel1GrdWmsTileLayer(b));
  return ranked[0] ?? SI_SENTINEL1_GRD_WMS_TILE_LAYER_FALLBACK;
}

export function isSentinel1NativeWmsLayerName(name: string): boolean {
  const u = String(name || '').trim().toUpperCase();
  if (u.includes('L1C') || u.includes('SENTINEL-2') || u.includes('S2-')) return false;
  return (
    u.includes('SENTINEL-1') ||
    u.includes('SENTINEL1') ||
    u.includes('S1-') ||
    u.includes('S1_') ||
    (u.includes('GRD') && u.includes('S1')) ||
    u.includes('IW-DV') ||
    u.includes('IW_DV') ||
    (u.includes('VV') && u.includes('VH') && u.includes('ORTHORECTIFIED')) ||
    (u.includes('VV') && u.includes('VH') && u.includes('RGB-RATIO')) ||
    (u.includes('ENHANCED-VISUALIZATION') && u.includes('ORTHORECTIFIED')) ||
    u.includes('FALSE-COLOR-URBAN') ||
    u === 'VV' ||
    u === 'VH' ||
    u.includes('SAR')
  );
}

/** Sentinel-1 GRD WMS tiles must not send optical cloud-cover (MAXCC). */
export function sentinelHubWmsUsesMaxCloudCover(
  logicalLayerId: string,
  wmsTileLayerName: string,
): boolean {
  if (isSentinel1InsarLayerId(logicalLayerId)) return false;
  if (isSentinel1NativeWmsLayerName(wmsTileLayerName)) return false;
  return true;
}
