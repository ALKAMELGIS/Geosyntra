/**
 * Sentinel Hub evalscript builders for Layer Live agro composite & delta indices.
 * Base indices use NDVI, SAVI, NDMI, NDWI derived from Sentinel-2 L2A bands.
 */

import {
  SI_NDVI_CLASSIFICATION_STOPS,
  type IndexRampStop,
  siRampStopsToEvalScriptArrayLiteral,
} from './siWmsIndexClassificationRamp';
import { type AgroCompositeFormula, getLayerLiveCompositeDef } from './siLayerLiveCompositeCatalog';

const EVAL_CLASSIFIED_RAMP_HELPERS = `
function __hexRgb(h) {
  return [((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0];
}
/** Discrete classified raster — one flat color per class interval (analytical only). */
function __classifiedRampRgb(t, stops) {
  var n = stops.length;
  if (n < 2) return __hexRgb(stops[0][1]);
  if (t <= stops[0][0]) return __hexRgb(stops[0][1]);
  for (var i = 1; i < n; i++) {
    if (t <= stops[i][0]) return __hexRgb(stops[i][1]);
  }
  return __hexRgb(stops[n - 1][1]);
}
`;

const AGRO_BAND_HELPERS = `
function __ndvi(s) {
  var d = s.B08 + s.B04;
  return d > 1e-6 ? (s.B08 - s.B04) / d : 0;
}
function __savi(s) {
  var d = s.B08 + s.B04 + 0.5;
  return d > 1e-6 ? 1.5 * (s.B08 - s.B04) / d : 0;
}
function __ndmi(s) {
  var d = s.B08 + s.B11;
  return d > 1e-6 ? (s.B08 - s.B11) / d : 0;
}
function __ndwi(s) {
  var d = s.B08 + s.B03;
  return d > 1e-6 ? (s.B03 - s.B08) / d : 0;
}
function __clampIdx(v) {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}
function __normIdx(v) {
  return (__clampIdx(v) + 1) / 2;
}
`;

/** Diverging 10-class delta ramp — degradation (red) → stable (amber) → improvement (green). */
export const SI_AGRO_DELTA_STOPS: readonly IndexRampStop[] = [
  [-1, 0x7f1d1d],
  [-0.75, 0xb91c1c],
  [-0.5, 0xdc2626],
  [-0.35, 0xea580c],
  [-0.2, 0xf97316],
  [-0.05, 0xfbbf24],
  [0.05, 0xa3e635],
  [0.2, 0x84cc16],
  [0.35, 0x22c55e],
  [0.5, 0x15803d],
  [1, 0x14532d],
];

/** Agricultural Risk Index — 10 visually distinct risk classes (low → high). */
export const SI_ARI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [0, 0x14532d],
  [0.1, 0x15803d],
  [0.2, 0x22c55e],
  [0.3, 0x84cc16],
  [0.4, 0xeab308],
  [0.5, 0xf59e0b],
  [0.6, 0xf97316],
  [0.7, 0xea580c],
  [0.8, 0xdc2626],
  [0.9, 0xb91c1c],
  [1, 0x7f1d1d],
];

/** Composite Crop Index — 20 agricultural decision classes (risk → excellent). */
export const SI_CCI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.2, 0x450a0a],
  [-0.16, 0x7f1d1d],
  [-0.12, 0xb91c1c],
  [-0.08, 0xdc2626],
  [-0.04, 0xef4444],
  [0, 0xea580c],
  [0.05, 0xf97316],
  [0.1, 0xfb923c],
  [0.15, 0xfdba74],
  [0.2, 0xfbbf24],
  [0.25, 0xfacc15],
  [0.3, 0xeab308],
  [0.35, 0xd9f99d],
  [0.4, 0xa3e635],
  [0.45, 0x84cc16],
  [0.5, 0x65a30d],
  [0.55, 0x4ade80],
  [0.6, 0x22c55e],
  [0.73, 0x16a34a],
  [0.87, 0x15803d],
  [1, 0x14532d],
];

/** CCI uses 20 discrete classes on the map and in legends. */
export const SI_CCI_SPECTRAL_CLASS_COUNT = 20;

export function getAgroCompositeDefaultStops(def: {
  formula: AgroCompositeFormula;
  isDelta: boolean;
}): readonly IndexRampStop[] {
  if (def.isDelta) return SI_AGRO_DELTA_STOPS;
  switch (def.formula) {
    case 'cci':
      return SI_CCI_CLASSIFICATION_STOPS;
    case 'ari':
    case 'chs':
    case 'cps':
    case 'fpr':
      return SI_ARI_CLASSIFICATION_STOPS;
    default:
      return SI_NDVI_CLASSIFICATION_STOPS;
  }
}

function formulaIndexExpr(formula: AgroCompositeFormula, sampleVar: string): string {
  const ndvi = `__ndvi(${sampleVar})`;
  const savi = `__savi(${sampleVar})`;
  const ndmi = `__ndmi(${sampleVar})`;
  const ndwi = `__ndwi(${sampleVar})`;
  switch (formula) {
    case 'vhs':
      return `((${ndvi}) + (${savi})) / 2`;
    case 'vdi':
      return `0.7 * (${ndvi}) + 0.3 * (${savi})`;
    case 'cvi':
      return `((${ndvi}) + (${ndmi}) + (${savi})) / 3`;
    case 'csi':
      return `1 - ((${ndvi}) + (${ndmi})) / 2`;
    case 'wst':
      return `(${ndvi}) - (${ndmi})`;
    case 'dri':
      return `1 - ((${ndmi}) + (${ndwi})) / 2`;
    case 'vmi':
      return `((${ndmi}) + (${ndwi})) / 2`;
    case 'smi':
      return `0.7 * (${ndmi}) + 0.3 * (${ndwi})`;
    case 'oir':
      return `(${ndwi}) - (${ndvi})`;
    case 'iei': {
      const saviGuard = `Math.abs(${savi}) > 1e-6 ? (${ndmi}) / (${savi}) : 0`;
      return `__clampIdx(${saviGuard})`;
    }
    case 'uii':
      return `(${savi}) - (${ndmi})`;
    case 'fpr':
    case 'cps':
      return `(1 - (${ndvi})) + (1 - (${ndmi}))`;
    case 'cpi':
      return `0.4 * (${ndvi}) + 0.3 * (${ndmi}) + 0.2 * (${savi}) + 0.1 * (${ndwi})`;
    case 'gpi':
      return `((${ndvi}) + (${savi}) + (${ndmi})) / 3`;
    case 'csi2': {
      const diff = `Math.abs((${ndvi}) - (${savi}))`;
      return `1 - ${diff}`;
    }
    case 'cri':
      return `(${ndvi}) + (${ndmi})`;
    case 'vdg':
      return `1 - ((${ndvi}) + (${savi})) / 2`;
    case 'ari':
      return `1 - ((${ndvi}) + (${ndmi}) + (${ndwi}) + (${savi})) / 4`;
    case 'chs':
      return `((${ndvi}) + (${ndmi}) + (${ndwi}) + (${savi})) / 4`;
    case 'cci': {
      const ndviN = `__normIdx(${ndvi})`;
      const saviN = `__normIdx(${savi})`;
      const ndmiN = `__normIdx(${ndmi})`;
      const ndwiN = `__normIdx(${ndwi})`;
      return `0.3 * (${ndviN}) + 0.2 * (${saviN}) + 0.3 * (${ndmiN}) - 0.2 * (${ndwiN})`;
    }
    default:
      return '0';
  }
}

function classifiedStopsLiteral(stops: readonly IndexRampStop[]): string {
  return siRampStopsToEvalScriptArrayLiteral(stops);
}

function alphaFromIndex(indexVar: string, thr: number | null): string {
  return thr == null
    ? 'var __a = s.dataMask;'
    : `var __a = s.dataMask * ((${indexVar}) >= ${thr} ? 1 : 0);`;
}

function alphaFromIndexDelta(indexVar: string, thr: number | null): string {
  return thr == null
    ? 'var __a = s2.dataMask * s1.dataMask;'
    : `var __a = s2.dataMask * s1.dataMask * (Math.abs(${indexVar}) >= ${thr} ? 1 : 0);`;
}

export function buildAgroCompositeEvalscript(
  layerId: string,
  indexVisibilityMin: number | null,
  classifiedStopsOverride: readonly IndexRampStop[] | null,
): string {
  const def = getLayerLiveCompositeDef(layerId);
  if (!def) return '';

  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(0, Math.min(1, indexVisibilityMin))
      : null;

  const stops = classifiedStopsLiteral(
    classifiedStopsOverride && classifiedStopsOverride.length >= 2
      ? classifiedStopsOverride
      : getAgroCompositeDefaultStops(def),
  );

  if (def.isDelta) {
    const idx1 = formulaIndexExpr(def.formula, 's1');
    const idx2 = formulaIndexExpr(def.formula, 's2');
    return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    mosaicking: "ORBIT",
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
${AGRO_BAND_HELPERS}
function evaluatePixel(samples) {
  if (!samples || samples.length < 1) return [0, 0, 0, 0];
  var s1 = samples[0];
  var s2 = samples[samples.length - 1];
  var idx1 = ${idx1};
  var idx2 = ${idx2};
  var idx = __clampIdx(idx2 - idx1);
  ${alphaFromIndexDelta('idx', thr)}
  var stops = ${stops};
  var c = __classifiedRampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
  }

  const idxExpr = formulaIndexExpr(def.formula, 's');
  const idxVar = def.formula === 'cci' ? idxExpr : `__clampIdx(${idxExpr})`;
  return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
${AGRO_BAND_HELPERS}
function evaluatePixel(s) {
  var idx = ${idxVar};
  ${alphaFromIndex('idx', thr)}
  var stops = ${stops};
  var c = __classifiedRampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
}

function agroCompositeStatsEncode(formula: AgroCompositeFormula): string {
  if (formula === 'cci') {
    return 'var t = (idx + 0.2) / 1.2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s.dataMask];';
  }
  return 'var t = (idx + 1) / 2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s.dataMask];';
}

function agroCompositeStatsEncodeDelta(formula: AgroCompositeFormula): string {
  if (formula === 'cci') {
    return 'var t = (idx + 0.2) / 1.2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s2.dataMask * s1.dataMask];';
  }
  return 'var t = (idx + 1) / 2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s2.dataMask * s1.dataMask];';
}

/** Stats evalscript — encodes composite index in R channel for AOI zonal stats. */
export function buildAgroCompositeStatsEvalscript(layerId: string): string {
  const def = getLayerLiveCompositeDef(layerId);
  if (!def) return '';
  const encode = agroCompositeStatsEncode(def.formula);
  const encodeDelta = agroCompositeStatsEncodeDelta(def.formula);

  if (def.isDelta) {
    const idx1 = formulaIndexExpr(def.formula, 's1');
    const idx2 = formulaIndexExpr(def.formula, 's2');
    return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    mosaicking: "ORBIT",
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${AGRO_BAND_HELPERS}
function evaluatePixel(samples) {
  if (!samples || samples.length < 1) return [0, 0, 0, 0];
  var s1 = samples[0];
  var s2 = samples[samples.length - 1];
  var idx1 = ${idx1};
  var idx2 = ${idx2};
  var idx = __clampIdx(idx2 - idx1);
  ${encodeDelta}
}`;
  }

  const idxExpr = formulaIndexExpr(def.formula, 's');
  const idxVar = def.formula === 'cci' ? idxExpr : `__clampIdx(${idxExpr})`;
  return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${AGRO_BAND_HELPERS}
function evaluatePixel(s) {
  var idx = ${idxVar};
  ${encode}
}`;
}
