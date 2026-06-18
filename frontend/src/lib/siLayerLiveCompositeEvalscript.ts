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
function __lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function __rampRgb(t, stops) {
  var n = stops.length;
  if (t <= stops[0][0]) return __hexRgb(stops[0][1]);
  if (t >= stops[n - 1][0]) return __hexRgb(stops[n - 1][1]);
  for (var i = 1; i < n; i++) {
    if (t <= stops[i][0]) {
      var t0 = stops[i - 1][0];
      var t1 = stops[i][0];
      var f = (t - t0) / (t1 - t0 + 1e-12);
      if (f < 0) f = 0;
      if (f > 1) f = 1;
      return __lerp3(__hexRgb(stops[i - 1][1]), __hexRgb(stops[i][1]), f);
    }
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
`;

export const SI_AGRO_DELTA_STOPS: readonly IndexRampStop[] = [
  [-1, 0xdc2626],
  [-0.25, 0xf97316],
  [0, 0xfbbf24],
  [0.25, 0x84cc16],
  [1, 0x16a34a],
];

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
      : def.isDelta
        ? SI_AGRO_DELTA_STOPS
        : SI_NDVI_CLASSIFICATION_STOPS,
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
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
  }

  const idxExpr = formulaIndexExpr(def.formula, 's');
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
  var idx = __clampIdx(${idxExpr});
  ${alphaFromIndex('idx', thr)}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
}

/** Stats evalscript — encodes composite index in R channel for AOI zonal stats. */
export function buildAgroCompositeStatsEvalscript(layerId: string): string {
  const def = getLayerLiveCompositeDef(layerId);
  if (!def) return '';
  const encode = `var t = (idx + 1) / 2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s.dataMask];`;
  const encodeDelta = `var t = (idx + 1) / 2; if (t < 0) t = 0; if (t > 1) t = 1; return [t, 0, 0, s2.dataMask * s1.dataMask];`;

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
  return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B04", "B08", "B11", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${AGRO_BAND_HELPERS}
function evaluatePixel(s) {
  var idx = __clampIdx(${idxExpr});
  ${encode}
}`;
}
