/**
 * Sentinel Hub OGC WMS AOI clipping: GEOMETRY (EPSG:3857 WKT) + EVALSCRIPT with dataMask-driven alpha.
 * @see https://docs.sentinel-hub.com/api/latest/api/ogc/additional-request-parameters/
 * @see https://www.sentinel-hub.com/faq/how-can-i-clip-image-specific-polygon/
 */

export type WmsAoiEvalProfile =
  | 'true_color'
  | 'false_color'
  | 'ndvi'
  | 'gndvi'
  | 'ndmi'
  | 'ndwi'
  | 'evi'
  | 'savi'
  | 'generic_rgb';

/** Bins for UI legend — value ranges are indicative for typical index domains (−1…1). */
export type WmsThematicLegendBin = {
  label: string
  color: string
};

const V3_INDEX_RAMP_HELPERS = `function _clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function _rRdYlGn(t){
  t=_clamp(t,0,1);
  if(t<0.5){var u=t/0.5;return[1,u,0];}
  var v=(t-0.5)/0.5;return[1-v,1,0];
}
function _rMoist(t){
  t=_clamp(t,0,1);
  return[0.12+0.33*t,0.45+0.45*t,0.95-0.62*t];
}
`;

function rgb01ToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rampRdYlGn01(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t))
  if (c < 0.5) {
    const u = c / 0.5
    return [1, u, 0]
  }
  const v = (c - 0.5) / 0.5
  return [1 - v, 1, 0]
}

function rampMoist01(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t))
  return [0.12 + 0.33 * x, 0.45 + 0.45 * x, 0.95 - 0.62 * x]
}

/** AOI WMS uses a custom EVALSCRIPT for these profiles (thematic RGBA, not raw RGB). */
export function isThematicWmsProfile(profile: WmsAoiEvalProfile): boolean {
  return profile === 'ndvi' || profile === 'gndvi' || profile === 'ndmi' || profile === 'ndwi' || profile === 'evi' || profile === 'savi'
}

export function getSentinelWmsThematicLegendBins(profile: WmsAoiEvalProfile): WmsThematicLegendBin[] {
  if (!isThematicWmsProfile(profile)) return []
  const moist = profile === 'ndmi' || profile === 'ndwi'
  const edges = [-1, -0.6, -0.2, 0.2, 0.6, 1]
  const out: WmsThematicLegendBin[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i]!
    const hi = edges[i + 1]!
    const mid = (lo + hi) / 2
    const t = (mid + 1) * 0.5
    const rgb = moist ? rampMoist01(t) : rampRdYlGn01(t)
    out.push({
      label: `${lo.toFixed(1)} … ${hi.toFixed(1)}`,
      color: rgb01ToHex(rgb[0], rgb[1], rgb[2]),
    })
  }
  return out
}

export type BuildSentinelHubWmsAoiClipOptions = {
  /** When set (0–1), multiply alpha by (index >= minIndex) for index-style profiles (e.g. NDVI). Ignored for RGB-only profiles. */
  indexVisibilityMin?: number | null;
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

/** Axis-aligned WGS84 bbox of all vertices → small EPSG:3857 POLYGON (fits tight URL limits). */
function bbox3857WktFromOuterRings(outerRings: [number, number][][]): string {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of outerRings) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLng) || maxLng <= minLng || maxLat <= minLat) {
    return polygon3857WktFromRing([
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ]);
  }
  const pad = 1e-5;
  return polygon3857WktFromRing([
    [minLng - pad, minLat - pad],
    [maxLng + pad, minLat - pad],
    [maxLng + pad, maxLat + pad],
    [minLng - pad, maxLat + pad],
    [minLng - pad, minLat - pad],
  ]);
}

export function inferWmsEvalProfile(layerName: string): WmsAoiEvalProfile {
  const u = String(layerName || '').toUpperCase();
  if (u.includes('GNDVI')) return 'gndvi';
  if (u.includes('SAVI')) return 'savi';
  if (u.includes('NDRE') || u.includes('BSI')) return 'generic_rgb';
  if (u.includes('NDVI')) return 'ndvi';
  if (u.includes('EVI') && !u.includes('NEVI')) return 'evi';
  if (u.includes('NDMI') || u.includes('MOISTURE')) return 'ndmi';
  if (u.includes('NDWI') || u.includes('MNDWI') || u.includes('WATER')) return 'ndwi';
  if (u.includes('FALSE') || u.includes('SWIR') || u.includes('COLOR_INFRARED')) return 'false_color';
  if (u.includes('TRUE') || u.includes('NATURAL') || u.includes('RGB')) return 'true_color';
  return 'generic_rgb';
}

function buildEvalscriptV3(profile: WmsAoiEvalProfile, indexVisibilityMin: number | null): string {
  const thr =
    indexVisibilityMin != null && Number.isFinite(indexVisibilityMin)
      ? Math.max(0, Math.min(1, indexVisibilityMin))
      : null;

  const alphaFromIndex = (indexVar: string) =>
    thr == null
      ? 'var __a = s.dataMask;'
      : `var __a = s.dataMask * ((${indexVar}) >= ${thr} ? 1 : 0);`;

  /** Explicit FLOAT32 avoids AUTO sample-type ambiguity in some OGC GetMap PNG paths. */
  const outRgba = 'output: { bands: 4, sampleType: "FLOAT32" }';

  switch (profile) {
    case 'true_color':
    case 'generic_rgb':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    ${outRgba}
  };
}
function evaluatePixel(s) {
  var r = Math.max(0, Math.min(1, s.B04 * 2.5));
  var g = Math.max(0, Math.min(1, s.B03 * 2.5));
  var b = Math.max(0, Math.min(1, s.B02 * 2.5));
  var a = Math.max(0, Math.min(1, s.dataMask));
  return [r, g, b, a];
}`;
    case 'false_color':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    ${outRgba}
  };
}
function evaluatePixel(s) {
  var r = Math.max(0, Math.min(1, s.B08 * 2.5));
  var g = Math.max(0, Math.min(1, s.B04 * 2.5));
  var b = Math.max(0, Math.min(1, s.B03 * 2.5));
  var a = Math.max(0, Math.min(1, s.dataMask));
  return [r, g, b, a];
}`;
    case 'ndvi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B04;
  var ndvi = d > 1e-6 ? (s.B08 - s.B04) / d : 0;
  ${alphaFromIndex('ndvi')}
  var t = (ndvi + 1) * 0.5;
  var c = _rRdYlGn(t);
  return [c[0], c[1], c[2], __a];
}`;
    case 'gndvi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B03;
  var gndvi = d > 1e-6 ? (s.B08 - s.B03) / d : 0;
  ${alphaFromIndex('gndvi')}
  var t = (gndvi + 1) * 0.5;
  var c = _rRdYlGn(t);
  return [c[0], c[1], c[2], __a];
}`;
    case 'savi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var L = 0.5;
  var d = s.B08 + s.B04 + L;
  var savi = d > 1e-6 ? (1 + L) * (s.B08 - s.B04) / d : 0;
  ${alphaFromIndex('savi')}
  var t = (savi + 1) * 0.5;
  var c = _rRdYlGn(t);
  return [c[0], c[1], c[2], __a];
}`;
    case 'ndmi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "B11", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B11;
  var ndmi = d > 1e-6 ? (s.B08 - s.B11) / d : 0;
  ${alphaFromIndex('ndmi')}
  var t = (ndmi + 1) * 0.5;
  var c = _rMoist(t);
  return [c[0], c[1], c[2], __a];
}`;
    case 'ndwi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B03", "B08", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var d = s.B08 + s.B03;
  var ndwi = d > 1e-6 ? (s.B03 - s.B08) / d : 0;
  ${alphaFromIndex('ndwi')}
  var t = (ndwi + 1) * 0.5;
  var c = _rMoist(t);
  return [c[0], c[1], c[2], __a];
}`;
    case 'evi':
      return `//VERSION=3
function setup() {
  return {
    input: ["B02", "B04", "B08", "dataMask"],
    ${outRgba}
  };
}
${V3_INDEX_RAMP_HELPERS}
function evaluatePixel(s) {
  var den = s.B08 + 6 * s.B04 - 7.5 * s.B02 + 1;
  var evi = den > 1e-6 ? 2.5 * ((s.B08 - s.B04) / den) : 0;
  ${alphaFromIndex('evi')}
  var t = _clamp((evi + 0.25) / 1.5, 0, 1);
  var c = _rRdYlGn(t);
  return [c[0], c[1], c[2], __a];
}`;
    default:
      return buildEvalscriptV3('generic_rgb', null);
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
  const profile = inferWmsEvalProfile(layerName);
  const indexMin = options?.indexVisibilityMin ?? null;
  const evalPlain = buildEvalscriptV3(profile, indexMin);
  const evalscriptB64: string | null = evalscriptToBase64Param(evalPlain);

  const geom = getDrawnGeometry(drawn);
  if (!geom) {
    /** Without AOI we still send EVALSCRIPT so indices render as RGB ramps (not catalog grayscale). */
    return { geometryWkt3857: null, evalscriptB64 };
  }

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

  /** Never drop EVALSCRIPT — catalog defaults are often single-band gray; use AOI bbox instead of omitting symbology. */
  if (geometryWkt3857.length > MAX_WKT_CHARS + 500) {
    geometryWkt3857 = bbox3857WktFromOuterRings(outerRings);
  }

  return { geometryWkt3857, evalscriptB64 };
}
