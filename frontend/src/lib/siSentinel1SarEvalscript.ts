/**
 * Sentinel Hub V3 evalscripts for Sentinel-1 GRD Layer Live (VV/VH SAR + temporal proxies).
 */

import { SI_AGRO_DELTA_STOPS } from './siLayerLiveCompositeEvalscript';
import {
  getSentinel1InsarLayerDef,
  type Sentinel1SarFormula,
} from './siSentinel1InsarLayerCatalog';
import {
  type IndexRampStop,
  siRampStopsToEvalScriptArrayLiteral,
} from './siWmsIndexClassificationRamp';

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

const SAR_BAND_HELPERS = `
function __lin(v) { return v > 1e-10 ? v : 1e-10; }
function __vv(s) { return __lin(s.VV); }
function __vh(s) { return __lin(s.VH); }
function __db(v) { return 10 * Math.log10(__lin(v)); }
function __bcr(s) {
  var vv = __vv(s);
  var vh = __vh(s);
  return vh > 1e-10 ? vv / vh : 1;
}
function __rvi(s) {
  var vv = __vv(s);
  var vh = __vh(s);
  var d = vv + vh;
  return d > 1e-10 ? (4 * vh) / d : 0;
}
function __nbi(s) {
  var vv = __vv(s);
  var vh = __vh(s);
  var d = vv + vh;
  return d > 1e-10 ? (vv - vh) / d : 0;
}
function __coh(s) {
  var vv = __vv(s);
  var vh = __vh(s);
  var d = vv + vh;
  return d > 1e-10 ? 1 - Math.abs(vv - vh) / d : 0;
}
function __incoh(s) { return 1 - __coh(s); }
function __smi(s) {
  var vv = __vv(s);
  var vh = __vh(s);
  return (vh / (vv + vh + 1e-10)) * (1 - __coh(s));
}
function __ssm(s) { return __smi(s); }
function __vsm(s) { return 0.65 * __smi(s) + 0.35 * __rvi(s); }
function __rsm(s) {
  var smi = __smi(s);
  return smi > 0.5 ? (smi - 0.5) * 2 : smi * 2;
}
function __sri(s) { return Math.abs(__nbi(s)); }
function __rrp(s) { return Math.sqrt(__vv(s) * __vh(s)); }
function __nrc(s) { return __sri(s) / (__rrp(s) + 1e-6); }
function __dce(s) { return 3 + 12 * __smi(s); }
function __rdi(s) { return __dce(s) / 15; }
function __spp(s) { return __rdi(s); }
function __los_disp(s) { return (__db(__vv(s)) + __db(__vh(s))) / 2; }
function __defo(s) { return __los_disp(s) * __nbi(s); }
function __v_disp(s) { return __db(__vh(s)) * 0.55; }
function __h_disp(s) { return __db(__vv(s)) * 0.45; }
function __ps_density(s) { return Math.min(1, __coh(s) * __rvi(s) * 4); }
function __gmi(s) { return __defo(s) / 25; }
function __dai(s) { return Math.abs(__gmi(s) - 0.5); }
function __sci_surface(s) { return __nbi(s) * __rvi(s); }
function __mdci(s) { return __smi(s) * __gmi(s); }
function __hdi(s) { return __smi(s) + __defo(s) / 40; }
function __smri(s) { return __mdci(s) + __hdi(s) * 0.5; }
function __phase_proxy(s) { return Math.atan2(__vh(s), __vv(s)); }
function __w_phase_proxy(s) {
  var p = __phase_proxy(s);
  return Math.sin(p * 6);
}
function __u_phase_proxy(s) { return __phase_proxy(s) / Math.PI; }
function __fdi(s) {
  var vvN = __normDb(__db(__vv(s)), -28, -5);
  return __clamp01((1 - vvN) * 0.5 + __incoh(s) * 0.3 + (1 - __clamp01(__rvi(s))) * 0.2);
}
function __wdi(s) {
  var vvN = __normDb(__db(__vv(s)), -28, -5);
  return __clamp01((1 - vvN) * 0.45 + __smi(s) * 0.35 + (1 - (__nbi(s) + 1) / 2) * 0.2);
}
function __sfi(s) {
  return __clamp01(__smi(s) * (1 - __normDb(__db(__vv(s)), -28, -5)) * 1.15);
}
function __ldi(s) {
  return __clamp01(__ssm(s) * (1 - __clamp01(__rvi(s))) * (1 - __normDb(__db(__vv(s)), -28, -5)) * 1.2);
}
function __cdi(s) {
  return __clamp01(__fdi(s) * 0.55 + __wdi(s) * 0.45);
}
function __clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
function __clamp11(v) {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}
function __normDb(v, lo, hi) {
  var t = (v - lo) / (hi - lo + 1e-12);
  return __clamp01(t);
}
`;

export const SI_S1_DEFORMATION_STOPS: readonly IndexRampStop[] = [
  [-1, 0x1e3a8a],
  [-0.5, 0x3b82f6],
  [0, 0xf8fafc],
  [0.5, 0xf97316],
  [1, 0xb91c1c],
];

export const SI_S1_COHERENCE_STOPS: readonly IndexRampStop[] = [
  [0, 0x1e1b4b],
  [0.25, 0x4338ca],
  [0.5, 0x06b6d4],
  [0.75, 0x22c55e],
  [1, 0xfef08a],
];

export const SI_S1_SOIL_STOPS: readonly IndexRampStop[] = [
  [0, 0x431407],
  [0.2, 0xb45309],
  [0.4, 0xd6d3d1],
  [0.6, 0x38bdf8],
  [0.8, 0x1d4ed8],
  [1, 0x1e3a8a],
];

export const SI_S1_BACKSCATTER_STOPS: readonly IndexRampStop[] = [
  [-30, 0x0a0a0a],
  [-25, 0x404040],
  [-20, 0x737373],
  [-15, 0xa3a3a3],
  [-10, 0xd4d4d4],
  [-5, 0xf5f5f5],
];

/** Flood / inundation — dry land → open water. */
export const SI_S1_FLOOD_STOPS: readonly IndexRampStop[] = [
  [0, 0xfef9c3],
  [0.2, 0xbbf7d0],
  [0.4, 0x7dd3fc],
  [0.6, 0x38bdf8],
  [0.8, 0x1d4ed8],
  [1, 0x1e3a8a],
];

export function stopsForSentinel1SarFormula(formula: Sentinel1SarFormula): readonly IndexRampStop[] {
  switch (formula) {
    case 'vv_db':
    case 'vh_db':
      return SI_S1_BACKSCATTER_STOPS;
    case 'coh':
    case 'incoh':
    case 't_coh':
    case 's_coh':
    case 'ps_density':
      return SI_S1_COHERENCE_STOPS;
    case 'smi':
    case 'ssm':
    case 'vsm':
    case 'rsm':
    case 'sma':
    case 'dce':
    case 'rdi':
    case 'spp':
    case 'sci_soil':
    case 'scd':
    case 'lsdi':
    case 'ssi':
      return SI_S1_SOIL_STOPS;
    case 'ds_change':
    case 'bsc':
    case 'acd':
    case 'bcr_change':
    case 'rvi_change':
    case 'ps_change':
    case 'd_phase_proxy':
    case 'cum_disp':
    case 'los_vel':
    case 'defo_vel':
    case 'v_ann':
    case 'ts_disp':
      return SI_AGRO_DELTA_STOPS;
    case 'fdi':
    case 'wdi':
    case 'wci':
    case 'sfi':
    case 'ldi':
    case 'cdi':
    case 'vv_drop':
    case 'vh_drop':
    case 'coh_drop':
      return SI_S1_FLOOD_STOPS;
    case 'los_disp':
    case 'defo':
    case 'v_disp':
    case 'h_disp':
    case 'gmi':
    case 'dai':
    case 'mdci':
    case 'hdi':
    case 'smri':
      return SI_S1_DEFORMATION_STOPS;
    default:
      return SI_S1_SOIL_STOPS;
  }
}

function formulaIndexExpr(formula: Sentinel1SarFormula, sampleVar: string): string {
  switch (formula) {
    case 'vv_db':
      return `__normDb(__db(__vv(${sampleVar})), -28, -5)`;
    case 'vh_db':
      return `__normDb(__db(__vh(${sampleVar})), -32, -8)`;
    case 'bcr':
      return `__clamp01((__bcr(${sampleVar}) - 0.5) / 4)`;
    case 'nbi':
      return `(__nbi(${sampleVar}) + 1) / 2`;
    case 'rvi':
      return `__clamp01(__rvi(${sampleVar}))`;
    case 'smi':
      return `__clamp01(__smi(${sampleVar}))`;
    case 'ssm':
      return `__clamp01(__ssm(${sampleVar}))`;
    case 'vsm':
      return `__clamp01(__vsm(${sampleVar}))`;
    case 'rsm':
      return `__clamp01(__rsm(${sampleVar}))`;
    case 'sma':
      return `__clamp11(__rsm(${sampleVar}) - 0.5)`;
    case 'sri':
      return `__clamp01(__sri(${sampleVar}) * 2)`;
    case 'rrp':
      return `__clamp01(Math.log10(__rrp(${sampleVar}) + 1) / 4)`;
    case 'nrc':
      return `__clamp01(__nrc(${sampleVar}))`;
    case 'dce':
      return `__clamp01((__dce(${sampleVar}) - 3) / 12)`;
    case 'rdi':
      return `__clamp01(__rdi(${sampleVar}))`;
    case 'spp':
      return `__clamp01(__spp(${sampleVar}))`;
    case 'coh':
      return `__clamp01(__coh(${sampleVar}))`;
    case 'incoh':
      return `__clamp01(__incoh(${sampleVar}))`;
    case 't_coh':
      return `__clamp01(__coh(${sampleVar}))`;
    case 's_coh':
      return `__clamp01(1 - Math.abs(__nbi(${sampleVar})))`;
    case 'phase_proxy':
      return `(__phase_proxy(${sampleVar}) + Math.PI) / (2 * Math.PI)`;
    case 'w_phase_proxy':
      return `(__w_phase_proxy(${sampleVar}) + 1) / 2`;
    case 'u_phase_proxy':
      return `(__u_phase_proxy(${sampleVar}) + 1) / 2`;
    case 'd_phase_proxy':
      return `__clamp11(__u_phase_proxy(${sampleVar}))`;
    case 'los_disp':
      return `__normDb(__los_disp(${sampleVar}), -22, -6)`;
    case 'defo':
      return `__clamp11(__defo(${sampleVar}) / 8)`;
    case 'v_disp':
      return `__normDb(__v_disp(${sampleVar}), -24, -8)`;
    case 'h_disp':
      return `__normDb(__h_disp(${sampleVar}), -24, -8)`;
    case 'cum_disp':
    case 'ts_disp':
      return `__clamp11(__defo(${sampleVar}) / 6)`;
    case 'los_vel':
    case 'defo_vel':
    case 'v_ann':
      return `__clamp11((__db(__vv(${sampleVar})) - __db(__vh(${sampleVar}))) / 12)`;
    case 'ps_density':
      return `__clamp01(__ps_density(${sampleVar}))`;
    case 'ds_change':
    case 'bsc':
    case 'acd':
      return `__clamp11((__db(__vv(${sampleVar})) - __db(__vh(${sampleVar}))) / 10)`;
    case 'gmi':
      return `__clamp11(__gmi(${sampleVar}))`;
    case 'dai':
      return `__clamp01(__dai(${sampleVar}) * 2)`;
    case 'sci_surface':
      return `__clamp11(__sci_surface(${sampleVar}))`;
    case 'sci_soil':
    case 'scd':
    case 'lsdi':
    case 'ssi':
      return `__clamp11(__smi(${sampleVar}) - 0.5)`;
    case 'mdci':
      return `__clamp01(__mdci(${sampleVar}) * 3)`;
    case 'hdi':
      return `__clamp01(__hdi(${sampleVar}))`;
    case 'smri':
      return `__clamp01(__smri(${sampleVar}))`;
    case 'fdi':
      return `__fdi(${sampleVar})`;
    case 'wdi':
      return `__wdi(${sampleVar})`;
    case 'wci':
      return `__wdi(${sampleVar})`;
    case 'sfi':
      return `__sfi(${sampleVar})`;
    case 'ldi':
      return `__ldi(${sampleVar})`;
    case 'cdi':
      return `__cdi(${sampleVar})`;
    case 'vv_drop':
      return `__normDb(__db(__vv(${sampleVar})), -28, -5)`;
    case 'vh_drop':
      return `__normDb(__db(__vh(${sampleVar})), -32, -8)`;
    case 'bcr_change':
      return `__clamp01((__bcr(${sampleVar}) - 0.5) / 4)`;
    case 'rvi_change':
      return `__clamp01(__rvi(${sampleVar}))`;
    case 'coh_drop':
      return `__clamp01(__coh(${sampleVar}))`;
    case 'ps_change':
      return `__clamp01(__ps_density(${sampleVar}))`;
    default:
      return `__clamp01(__smi(${sampleVar}))`;
  }
}

function temporalDeltaExpr(
  formula: Sentinel1SarFormula,
  temporalKind: 'drop' | 'rise' | 'delta' | undefined,
  idx1: string,
  idx2: string,
): string {
  switch (temporalKind) {
    case 'drop':
      return `__clamp01(Math.max(0, (${idx1}) - (${idx2})))`;
    case 'rise':
      return `__clamp01(Math.max(0, (${idx2}) - (${idx1})))`;
    default:
      return `__clamp11((${idx2}) - (${idx1}))`;
  }
}

function classifiedStopsLiteral(
  override: readonly IndexRampStop[] | null | undefined,
  fallback: readonly IndexRampStop[],
): string {
  const use = override && override.length >= 2 ? override : fallback;
  return siRampStopsToEvalScriptArrayLiteral(use);
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

export function buildSentinel1SarEvalscript(
  layerId: string,
  indexVisibilityMin: number | null,
  classifiedStopsOverride: readonly IndexRampStop[] | null,
): string {
  const def = getSentinel1InsarLayerDef(layerId);
  if (!def) return '';

  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(0, Math.min(1, indexVisibilityMin))
      : null;

  const baseStops = stopsForSentinel1SarFormula(def.formula);
  const stops = classifiedStopsLiteral(classifiedStopsOverride, baseStops);
  const rampMin =
    def.temporal && baseStops === SI_AGRO_DELTA_STOPS ? SI_AGRO_DELTA_STOPS : baseStops;
  const stopsLit = classifiedStopsLiteral(classifiedStopsOverride, rampMin);

  if (def.temporal) {
    const idx1 = formulaIndexExpr(def.formula, 's1');
    const idx2 = formulaIndexExpr(def.formula, 's2');
    const deltaExpr = temporalDeltaExpr(def.formula, def.temporalKind, idx1, idx2);
    return `//VERSION=3
function setup() {
  return {
    input: ["VV", "VH", "dataMask"],
    mosaicking: "ORBIT",
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
${SAR_BAND_HELPERS}
function evaluatePixel(samples) {
  if (!samples || samples.length < 1) return [0, 0, 0, 0];
  var s1 = samples[0];
  var s2 = samples[samples.length - 1];
  var idx = ${deltaExpr};
  ${alphaFromIndexDelta('idx', thr)}
  var stops = ${stopsLit};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
  }

  const idxExpr = formulaIndexExpr(def.formula, 's');
  return `//VERSION=3
function setup() {
  return {
    input: ["VV", "VH", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
${SAR_BAND_HELPERS}
function evaluatePixel(s) {
  var idx = ${idxExpr};
  ${alphaFromIndex('idx', thr)}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
}
