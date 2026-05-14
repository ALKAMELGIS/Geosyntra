/**
 * Sentinel Hub OGC WMS AOI clipping: GEOMETRY (EPSG:3857 WKT) + EVALSCRIPT with dataMask-driven alpha.
 * @see https://docs.sentinel-hub.com/api/latest/api/ogc/additional-request-parameters/
 * @see https://www.sentinel-hub.com/faq/how-can-i-clip-image-specific-polygon/
 */

import {
  SI_EVI_CLASSIFICATION_STOPS,
  SI_GNDVI_CLASSIFICATION_STOPS,
  SI_NDMI_CLASSIFICATION_STOPS,
  SI_NDVI_CLASSIFICATION_STOPS,
  SI_NDWI_CLASSIFICATION_STOPS,
  type IndexRampStop,
  siRampStopsToEvalScriptArrayLiteral,
} from './siWmsIndexClassificationRamp';

export type WmsAoiEvalProfile =
  | 'native'
  | 'true_color'
  | 'false_color'
  | 'swir'
  | 'ndvi'
  | 'gndvi'
  | 'ndmi'
  | 'ndwi'
  | 'evi'
  | 'generic_rgb';

export type BuildSentinelHubWmsAoiClipOptions = {
  /** When set (0–1), multiply alpha by (index >= minIndex) for index-style profiles (e.g. NDVI). Ignored for RGB-only profiles. */
  indexVisibilityMin?: number | null;
  /**
   * Optional piecewise ramp for classified index profiles (same index math; different colors only).
   * Must be at least two ascending stops; otherwise defaults apply.
   */
  classifiedStopsOverride?: readonly IndexRampStop[] | null;
};

const MAX_WKT_CHARS = 5600;
const MAX_RING_VERTICES = 72;

/** WGS84 lon/lat → Web Mercator (EPSG:3857), meters. */
export function lngLatToWebMercator(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180);
  return [x, y];
}

function ringClosed(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, a];
}

function perpendicularDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [x, y] = p;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const nx = x1 + t * dx;
  const ny = y1 + t * dy;
  return Math.hypot(x - nx, y - ny);
}

function douglasPeucker(ring: [number, number][], epsilonDeg: number): [number, number][] {
  if (ring.length <= 2) return ring;
  let dmax = 0;
  let index = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = perpendicularDistance(ring[i]!, ring[0]!, ring[ring.length - 1]!);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  if (dmax > epsilonDeg) {
    const a = douglasPeucker(ring.slice(0, index + 1), epsilonDeg);
    const b = douglasPeucker(ring.slice(index), epsilonDeg);
    return [...a.slice(0, -1), ...b];
  }
  return [ring[0]!, ring[ring.length - 1]!];
}

function decimateMax(ring: [number, number][], maxPts: number): [number, number][] {
  if (ring.length <= maxPts) return ring;
  const step = Math.ceil(ring.length / maxPts);
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]!);
  const last = ring[ring.length - 1]!;
  const prev = out[out.length - 1]!;
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last);
  return out;
}

function simplifyOuterRingWgs84(ring: [number, number][]): [number, number][] {
  const closed = ringClosed(ring);
  let eps = 0.000025;
  let simplified = douglasPeucker(closed, eps);
  for (let k = 0; k < 8 && simplified.length > MAX_RING_VERTICES; k++) {
    eps *= 1.75;
    simplified = douglasPeucker(closed, eps);
  }
  simplified = decimateMax(simplified, MAX_RING_VERTICES);
  return ringClosed(simplified);
}

/** Comma-separated "x y" pairs in EPSG:3857 (meters), fixed precision to shorten URLs. */
function ringWgs84To3857CoordPairs(ring: [number, number][]): string {
  return ring
    .map(([lng, lat]) => {
      const [x, y] = lngLatToWebMercator(lng, lat);
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(', ');
}

/** OGC WKT POLYGON with one outer ring: POLYGON(( x y, ... )) */
function polygon3857WktFromRing(ring: [number, number][]): string {
  const pts = ringWgs84To3857CoordPairs(ring);
  return `POLYGON((${pts}))`;
}

/** OGC MULTIPOLYGON from several outer rings. */
function multiPolygon3857Wkt(rings: [number, number][][]): string {
  if (rings.length === 1) return polygon3857WktFromRing(rings[0]!);
  const parts = rings.map(r => `((${ringWgs84To3857CoordPairs(r)}))`).join(', ');
  return `MULTIPOLYGON(${parts})`;
}

export function inferWmsEvalProfile(layerName: string): WmsAoiEvalProfile {
  const u = String(layerName || '').toUpperCase();
  if (u.includes('GNDVI')) return 'gndvi';
  if (u.includes('NDRE') || u.includes('BSI')) return 'native';
  // Thermal / SAR products — not NDVI-classified custom scripts (avoid false "vegetation" ramps).
  if (u.includes('LST') || u.includes('LAND SURFACE') || u.includes('THERMAL') || u.includes('TEMPERATURE')) return 'native';
  if (u.includes('SAR') && !u.includes('SAVI')) return 'native';
  if (u.includes('SAVI')) return 'native';
  // Water / moisture before generic NDVI — many catalog names list multiple indices (e.g. "NDVI_NDWI").
  if (u.includes('NDWI') || u.includes('MNDWI') || u.includes('WATER')) return 'ndwi';
  if (u.includes('NDMI') || u.includes('MOISTURE')) return 'ndmi';
  if (u.includes('NDVI')) return 'ndvi';
  if (u.includes('EVI') && !u.includes('NEVI')) return 'evi';
  if (u.includes('SWIR') && !u.includes('FALSE')) return 'swir';
  if (u.includes('FALSE') || u.includes('COLOR_INFRARED')) return 'false_color';
  if (u.includes('TRUE') || u.includes('NATURAL') || u.includes('RGB')) return 'true_color';
  return 'native';
}

/** Shared piecewise-linear ramp (Sentinel Hub V3 process API JS). */
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

function classifiedStopsLiteral(
  override: readonly IndexRampStop[] | null | undefined,
  fallback: readonly IndexRampStop[],
): string {
  const use = override && override.length >= 2 ? override : fallback;
  return siRampStopsToEvalScriptArrayLiteral(use);
}

function buildEvalscriptV3(
  profile: WmsAoiEvalProfile,
  indexVisibilityMin: number | null,
  classifiedStopsOverride: readonly IndexRampStop[] | null,
): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(0, Math.min(1, indexVisibilityMin))
      : null;

  const alphaFromIndex = (indexVar: string) =>
    thr == null
      ? 'var __a = s.dataMask;'
      : `var __a = s.dataMask * ((${indexVar}) >= ${thr} ? 1 : 0);`;

  switch (profile) {
    case 'native':
      return '';
    case 'true_color':
    case 'generic_rgb':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    Math.max(0, Math.min(1, s.B03 * 2.5)),
    Math.max(0, Math.min(1, s.B02 * 2.5)),
    s.dataMask
  ];
}`;
    case 'false_color':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B08 * 2.5)),
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    Math.max(0, Math.min(1, s.B03 * 2.5)),
    s.dataMask
  ];
}`;
    case 'swir':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B04", "B8A", "B12", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B12 * 2.5)),
    Math.max(0, Math.min(1, s.B8A * 2.5)),
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    s.dataMask
  ];
}`;
    case 'ndvi': {
      const stops = classifiedStopsLiteral(classifiedStopsOverride, SI_NDVI_CLASSIFICATION_STOPS);
      return `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B04;
  var idx = d > 1e-6 ? (s.B08 - s.B04) / d : -1;
  ${alphaFromIndex('idx')}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
    }
    case 'gndvi': {
      const stops = classifiedStopsLiteral(classifiedStopsOverride, SI_GNDVI_CLASSIFICATION_STOPS);
      return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B03;
  var idx = d > 1e-6 ? (s.B08 - s.B03) / d : -1;
  ${alphaFromIndex('idx')}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
    }
    case 'ndmi': {
      const stops = classifiedStopsLiteral(classifiedStopsOverride, SI_NDMI_CLASSIFICATION_STOPS);
      return `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "B11", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B11;
  var idx = d > 1e-6 ? (s.B08 - s.B11) / d : -1;
  ${alphaFromIndex('idx')}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
    }
    case 'ndwi': {
      const stops = classifiedStopsLiteral(classifiedStopsOverride, SI_NDWI_CLASSIFICATION_STOPS);
      return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B03;
  var idx = d > 1e-6 ? (s.B03 - s.B08) / d : -1;
  ${alphaFromIndex('idx')}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
    }
    case 'evi': {
      const stops = classifiedStopsLiteral(classifiedStopsOverride, SI_EVI_CLASSIFICATION_STOPS);
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B04", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
${EVAL_CLASSIFIED_RAMP_HELPERS}
function evaluatePixel(s) {
  var den = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1;
  var raw = den > 1e-6 ? 2.5 * ((s.B08 - s.B04) / den) : 0;
  var idx = raw < -1 ? -1 : (raw > 1 ? 1 : raw);
  ${alphaFromIndex('idx')}
  var stops = ${stops};
  var c = __rampRgb(idx, stops);
  return [c[0], c[1], c[2], __a];
}`;
    }
    default:
      return buildEvalscriptV3('generic_rgb', indexVisibilityMin, null);
  }
}

export function evalscriptToBase64Param(script: string): string {
  const bin = unescape(encodeURIComponent(script.replace(/\r\n/g, '\n').trim()));
  return btoa(bin);
}

/** Minimal geometry typing (drawn AOI is Polygon / MultiPolygon). */
export type DrawnAoiGeometry =
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] };

export function getDrawnGeometry(geo: unknown): DrawnAoiGeometry | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as {
    type?: string;
    geometry?: DrawnAoiGeometry;
    features?: Array<{ geometry?: DrawnAoiGeometry }>;
  };
  if (g.type === 'Feature' && g.geometry) return getDrawnGeometry(g.geometry);
  if (g.type === 'FeatureCollection' && Array.isArray(g.features) && g.features[0]?.geometry) {
    return getDrawnGeometry(g.features[0].geometry);
  }
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g as DrawnAoiGeometry;
  return null;
}

/**
 * Builds EPSG:3857 WKT for GEOMETRY=… (same CRS as WMS BBOX) and base64 EVALSCRIPT for RGBA + dataMask alpha.
 */
export function buildSentinelHubWmsAoiClip(
  drawn: unknown,
  layerName: string,
  options?: BuildSentinelHubWmsAoiClipOptions,
): { geometryWkt3857: string | null; evalscriptB64: string | null } {
  const geom = getDrawnGeometry(drawn);
  if (!geom) {
    return { geometryWkt3857: null, evalscriptB64: null };
  }

  const profile = inferWmsEvalProfile(layerName);
  const indexMin = options?.indexVisibilityMin ?? null;
  const classifiedStopsOverride = options?.classifiedStopsOverride ?? null;
  const evalPlain = buildEvalscriptV3(profile, indexMin, classifiedStopsOverride);
  let evalscriptB64: string | null = evalPlain ? evalscriptToBase64Param(evalPlain) : null;

  const outerRings: [number, number][][] = [];
  if (geom.type === 'Polygon') {
    const outer = geom.coordinates[0] as [number, number][];
    if (outer?.length >= 3) outerRings.push(simplifyOuterRingWgs84(outer));
  } else {
    for (const poly of geom.coordinates) {
      const outer = poly[0] as [number, number][];
      if (outer?.length >= 3) outerRings.push(simplifyOuterRingWgs84(outer));
    }
  }
  if (!outerRings.length) return { geometryWkt3857: null, evalscriptB64 };

  let geometryWkt3857 = multiPolygon3857Wkt(outerRings);
  let combinedLen = geometryWkt3857.length + (evalscriptB64?.length ?? 0);

  if (combinedLen > MAX_WKT_CHARS) {
    const coarser = outerRings.map(r => decimateMax(douglasPeucker(ringClosed(r), 0.0002), 24));
    geometryWkt3857 = multiPolygon3857Wkt(coarser);
    combinedLen = geometryWkt3857.length + (evalscriptB64?.length ?? 0);
  }
  if (geometryWkt3857.length > MAX_WKT_CHARS) {
    geometryWkt3857 = multiPolygon3857Wkt(outerRings.map(r => decimateMax(r, 12)));
  }

  if (geometryWkt3857.length > MAX_WKT_CHARS + 500) {
    evalscriptB64 = null;
  }

  return { geometryWkt3857, evalscriptB64 };
}
