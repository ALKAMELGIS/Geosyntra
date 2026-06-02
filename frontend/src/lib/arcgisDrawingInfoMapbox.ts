/**
 * Map ArcGIS Feature Layer `drawingInfo` (as returned by `.../layer/{id}?f=pjson`)
 * to Mapbox GL JS paint props for GeoJSON fill/line layers (subset of renderers).
 */

/** Prevent huge renderers from blowing the JS stack or freezing Mapbox expression compilation. */
const ARCGIS_MAX_UNIQUE_VALUE_INFOS = 220;
const ARCGIS_MAX_CLASS_BREAK_INFOS = 160;
const ARCGIS_DRAWING_INFO_MAX_JSON_CHARS = 380_000;

/**
 * Clone and cap ArcGIS `drawingInfo` for browser storage and Mapbox paint conversion.
 * Returns `null` if the payload is invalid or still too large after capping (caller should drop symbology).
 */
export function sanitizeArcgisDrawingInfoForClient(drawingInfo: unknown): Record<string, unknown> | null {
  if (!drawingInfo || typeof drawingInfo !== 'object') return null;
  let di: any;
  try {
    di = JSON.parse(JSON.stringify(drawingInfo));
  } catch {
    return null;
  }
  const ren = di?.renderer;
  if (ren && typeof ren === 'object') {
    if (Array.isArray(ren.uniqueValueInfos) && ren.uniqueValueInfos.length > ARCGIS_MAX_UNIQUE_VALUE_INFOS) {
      ren.uniqueValueInfos = ren.uniqueValueInfos.slice(0, ARCGIS_MAX_UNIQUE_VALUE_INFOS);
    }
    if (Array.isArray(ren.classBreakInfos) && ren.classBreakInfos.length > ARCGIS_MAX_CLASS_BREAK_INFOS) {
      ren.classBreakInfos = ren.classBreakInfos.slice(0, ARCGIS_MAX_CLASS_BREAK_INFOS);
    }
  }
  try {
    const s = JSON.stringify(di);
    if (s.length > ARCGIS_DRAWING_INFO_MAX_JSON_CHARS) return null;
  } catch {
    return null;
  }
  return di as Record<string, unknown>;
}

function esriColorToCss(c: unknown): string | null {
  if (!Array.isArray(c) || c.length < 3) return null;
  const r = Math.max(0, Math.min(255, Math.round(Number(c[0]))));
  const g = Math.max(0, Math.min(255, Math.round(Number(c[1]))));
  const b = Math.max(0, Math.min(255, Math.round(Number(c[2]))));
  if (![r, g, b].every(n => Number.isFinite(n))) return null;
  let a = c.length >= 4 ? Number(c[3]) : 255;
  if (!Number.isFinite(a)) a = 255;
  const alpha = a <= 1 ? a : a / 255;
  const ao = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${ao})`;
}

function symbolFillColor(symbol: any): string | null {
  if (!symbol) return null;
  if (Array.isArray(symbol.color)) return esriColorToCss(symbol.color);
  return null;
}

function symbolOutlineStyle(symbol: any): { color: string | null; width: number } {
  const o = symbol?.outline;
  if (!o) return { color: null, width: 1 };
  const color = Array.isArray(o.color) ? esriColorToCss(o.color) : null;
  const w = typeof o.width === 'number' && Number.isFinite(o.width) ? Math.max(0.5, o.width) : 1;
  return { color, width: w };
}

function defaultFillOpacity(symbol: any): number {
  const c = symbol?.color;
  if (Array.isArray(c) && c.length >= 4) {
    const a = Number(c[3]);
    if (Number.isFinite(a)) return a <= 1 ? Math.max(0.05, Math.min(1, a)) : Math.max(0.05, Math.min(1, a / 255));
  }
  return 0.42;
}

/** ArcGIS polygon fill symbol with no interior (outline-only in map). */
function esriPolygonFillIsHollow(symbol: any): boolean {
  if (!symbol) return true;
  const st = symbol.style;
  if (st === 'esriSFSNull' || Number(st) === 1) return true;
  if (String(st).toLowerCase().includes('null')) return true;
  const c = symbol.color;
  if (Array.isArray(c) && c.length >= 4) {
    const a = Number(c[3]);
    const alpha = Number.isFinite(a) ? (a <= 1 ? a : a / 255) : 1;
    if (alpha < 0.04) return true;
  }
  return false;
}

/** Coalesce GeoJSON attribute keys — renderer field names may differ from aliases or casing in features. */
export function propertyGetExpression(field: string): any {
  const f = field.trim();
  if (!f) return ['literal', ''];
  const underscored = f.replace(/\s+/g, '_');
  const noSpace = f.replace(/\s+/g, '');
  const variants = Array.from(
    new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()]),
  ).filter(Boolean);
  if (variants.length === 1) return ['get', variants[0]!];
  const inner: any[] = ['coalesce'];
  for (const v of variants) inner.push(['get', v]);
  inner.push(['literal', '']);
  return inner;
}

/** Unique / class-break field name(s) — REST uses `field1`, older services use `field`, or `fields[]`. */
export function pickRendererPrimaryField(ren: any): string {
  if (typeof ren?.field1 === 'string' && ren.field1.trim()) return ren.field1.trim();
  if (typeof ren?.field === 'string' && ren.field.trim()) return ren.field.trim();
  if (Array.isArray(ren?.fields)) {
    const f0 = ren.fields[0];
    if (typeof f0 === 'string' && f0.trim()) return f0.trim();
    if (f0 && typeof f0.name === 'string' && f0.name.trim()) return f0.name.trim();
  }
  return '';
}

/** Mapbox expression: string key used in `match` for unique value (supports field1|field2|… when present). */
function uniqueValueKeyExpression(ren: any): any {
  const f1 = typeof ren.field1 === 'string' ? ren.field1.trim() : '';
  const f2 = typeof ren.field2 === 'string' ? ren.field2.trim() : '';
  const f3 = typeof ren.field3 === 'string' ? ren.field3.trim() : '';
  const delim = typeof ren.fieldDelimiter === 'string' && ren.fieldDelimiter.length ? ren.fieldDelimiter : '|';
  const parts = [f1, f2, f3].filter(Boolean);
  if (parts.length === 0) {
    const fb = pickRendererPrimaryField(ren);
    return fb ? ['to-string', propertyGetExpression(fb)] : ['to-string', ['literal', '']];
  }
  if (parts.length === 1) return ['to-string', propertyGetExpression(parts[0]!)];
  const concat: any[] = ['concat'];
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) concat.push(delim);
    concat.push(['to-string', propertyGetExpression(parts[i]!)]);
  }
  return concat;
}

function normalizeUniqueValueKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** ArcGIS `uniqueValueInfos` may use coded `value` while features carry `label` text (or the reverse). */
export function uniqueValueInfoKeys(uvi: any): string[] {
  const keys = new Set<string>();
  const v = normalizeUniqueValueKey(uvi?.value);
  const label = typeof uvi?.label === 'string' ? normalizeUniqueValueKey(uvi.label) : '';
  if (v) keys.add(v);
  if (label) keys.add(label);
  return Array.from(keys);
}

function propertyFieldVariants(field: string): string[] {
  const f = field.trim();
  if (!f) return [];
  const underscored = f.replace(/\s+/g, '_');
  const noSpace = f.replace(/\s+/g, '');
  return Array.from(new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()])).filter(
    Boolean,
  );
}

function readPropertyVariant(props: Record<string, unknown>, field: string): string {
  for (const key of propertyFieldVariants(field)) {
    const v = props[key];
    if (v !== undefined && v !== null) return normalizeUniqueValueKey(v);
  }
  return '';
}

function readNumericProperty(props: Record<string, unknown>, field: string): number | null {
  const raw = readPropertyVariant(props, field);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildUniqueValueKeyFromProperties(ren: any, props: Record<string, unknown>): string {
  const f1 = typeof ren.field1 === 'string' ? ren.field1.trim() : '';
  const f2 = typeof ren.field2 === 'string' ? ren.field2.trim() : '';
  const f3 = typeof ren.field3 === 'string' ? ren.field3.trim() : '';
  const delim = typeof ren.fieldDelimiter === 'string' && ren.fieldDelimiter.length ? ren.fieldDelimiter : '|';
  const parts = [f1, f2, f3].filter(Boolean);
  if (!parts.length) {
    const fb = pickRendererPrimaryField(ren);
    return fb ? readPropertyVariant(props, fb) : '';
  }
  return parts.map(p => readPropertyVariant(props, p)).join(delim);
}

/** Fill or outline color shown on the map for an Esri symbol (matches Mapbox paint). */
export function esriSymbolDisplayColor(symbol: any): string | null {
  if (!symbol) return null;
  const fill = symbolFillColor(symbol);
  if (fill && !esriPolygonFillIsHollow(symbol)) return fill;
  const outline = symbolOutlineStyle(symbol);
  return outline.color || fill;
}

export type ArcgisLegendRow = { label: string; color: string; rawValue?: string };

/** Legend swatches derived from the same ArcGIS renderer used for Mapbox fill/line paint. */
export function arcgisDrawingInfoToLegendRows(
  drawingInfo: any,
  opts?: {
    maxItems?: number;
    resolveLabel?: (field: string, rawValue: string, uviLabel: string) => string;
  },
): ArcgisLegendRow[] {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return [];
  const t = String(ren.type || '');
  const max = Math.max(1, Math.min(40, Math.floor(opts?.maxItems ?? 24)));
  const field = pickRendererPrimaryField(ren);
  const resolve = opts?.resolveLabel;

  if (t === 'uniqueValue') {
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(0, max);
    return infos.map((uvi: any) => {
      const rawVal = uvi?.value;
      const rawStr = rawVal === null || rawVal === undefined ? '' : String(rawVal);
      const uviLabel = String(uvi?.label ?? '').trim();
      const baseLabel = uviLabel || rawStr || 'Value';
      const label = resolve && field && rawStr !== '' ? resolve(field, rawStr, baseLabel) : baseLabel;
      const color = esriSymbolDisplayColor(uvi?.symbol) ?? 'rgba(148, 163, 184, 0.55)';
      return { label, color, rawValue: rawStr };
    });
  }

  if (t === 'classBreaks') {
    const raw = Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : [];
    const sorted = [...raw]
      .filter((br: any) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: any, b: any) => {
        const ma = Number(a?.minValue);
        const mb = Number(b?.minValue);
        if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
        return Number(a?.maxValue) - Number(b?.maxValue);
      });
    return sorted.slice(0, max).map((br: any) => ({
      label: `${br?.minValue ?? ''} – ${br?.maxValue ?? ''}`,
      color: esriSymbolDisplayColor(br?.symbol) ?? 'rgba(148, 163, 184, 0.55)',
    }));
  }

  if (t === 'simple') {
    return [
      {
        label: 'Symbol',
        color: esriSymbolDisplayColor(ren.symbol) ?? '#22c55e',
      },
    ];
  }

  return [];
}

/** Resolve one feature's display color from ArcGIS `drawingInfo.renderer` (client-side mirror of Mapbox match). */
export function arcgisColorForFeatureProperties(
  drawingInfo: any,
  properties: Record<string, unknown> | null | undefined,
): string | null {
  const props = properties && typeof properties === 'object' ? properties : {};
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    return esriSymbolDisplayColor(ren.symbol);
  }

  if (t === 'uniqueValue') {
    const key = buildUniqueValueKeyFromProperties(ren, props);
    const infos = Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : [];
    for (const uvi of infos) {
      if (!key) break;
      if (uniqueValueInfoKeys(uvi).includes(key)) return esriSymbolDisplayColor(uvi.symbol);
    }
    return esriSymbolDisplayColor(ren.defaultSymbol);
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    const num = field ? readNumericProperty(props, field) : null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).filter((br: any) =>
      Number.isFinite(Number(br?.maxValue)),
    );
    const infos = [...rawInfos].sort((a: any, b: any) => Number(a?.minValue) - Number(b?.minValue));
    if (num !== null) {
      for (const br of infos) {
        const maxV = Number(br.maxValue);
        const minV = Number(br.minValue);
        const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) ?? -1e15;
        if (num >= low && num <= maxV) return esriSymbolDisplayColor(br.symbol);
      }
    }
    return esriSymbolDisplayColor(ren.defaultSymbol);
  }

  return null;
}

function symbolMarkerRadius(symbol: any): number {
  const s = symbol?.size;
  if (typeof s === 'number' && Number.isFinite(s) && s > 0) return Math.max(3, Math.min(22, s * 0.85));
  return 5;
}

export type ArcgisMapboxCirclePaint = {
  'circle-color': string | any[];
  'circle-radius': number | any[];
  'circle-stroke-width': number | any[];
  'circle-stroke-color': string | any[];
  'circle-opacity'?: number | any[];
};

/** Point / multipoint layers: unique-value & simple marker colors from ArcGIS `drawingInfo`. */
export function arcgisDrawingInfoToCirclePaint(
  drawingInfo: any,
  fallbackColor: string,
): ArcgisMapboxCirclePaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const col = symbolFillColor(ren.symbol) || fallbackColor;
    const ol = symbolOutlineStyle(ren.symbol);
    return {
      'circle-color': col,
      'circle-radius': symbolMarkerRadius(ren.symbol),
      'circle-stroke-width': ol.color ? Math.max(0.5, ol.width) : 0,
      'circle-stroke-color': ol.color || 'rgba(15, 23, 42, 0.72)',
      'circle-opacity': defaultFillOpacity(ren.symbol),
    };
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const defSym = ren.defaultSymbol;
    const defOutline = symbolOutlineStyle(defSym);
    const defCol = symbolFillColor(defSym) || defOutline.color || fallbackColor;
    const defR = symbolMarkerRadius(defSym);
    const colorExpr: any[] = ['match', fieldExpr];
    const radiusExpr: any[] = ['match', fieldExpr];
    const strokeWExpr: any[] = ['match', fieldExpr];
    const strokeColExpr: any[] = ['match', fieldExpr];
    const opExpr: any[] = ['match', fieldExpr];
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(
      0,
      ARCGIS_MAX_UNIQUE_VALUE_INFOS,
    );
    const pushed = new Set<string>();
    for (const uvi of infos) {
      const sym = uvi?.symbol;
      const ol = symbolOutlineStyle(sym);
      const fc = symbolFillColor(sym) || ol.color || defCol;
      const r = symbolMarkerRadius(sym);
      const sw = ol.color ? Math.max(0.5, ol.width) : 0;
      const sc = ol.color || 'rgba(15, 23, 42, 0.72)';
      const fo = defaultFillOpacity(sym);
      for (const v of uniqueValueInfoKeys(uvi)) {
        if (!v || pushed.has(v)) continue;
        pushed.add(v);
        colorExpr.push(v, fc);
        radiusExpr.push(v, r);
        strokeWExpr.push(v, sw);
        strokeColExpr.push(v, sc);
        opExpr.push(v, fo);
      }
    }
    colorExpr.push(defCol);
    radiusExpr.push(defR);
    strokeWExpr.push(defOutline.color ? Math.max(0.5, defOutline.width) : 0);
    strokeColExpr.push(defOutline.color || 'rgba(15, 23, 42, 0.72)');
    opExpr.push(defaultFillOpacity(defSym));
    return {
      'circle-color': colorExpr,
      'circle-radius': radiusExpr,
      'circle-stroke-width': strokeWExpr,
      'circle-stroke-color': strokeColExpr,
      'circle-opacity': opExpr,
    };
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).slice(
      0,
      ARCGIS_MAX_CLASS_BREAK_INFOS,
    );
    const infos = [...rawInfos].filter((br: any) => Number.isFinite(Number(br?.maxValue))).sort((a: any, b: any) => {
      const ma = Number(a?.minValue);
      const mb = Number(b?.minValue);
      if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
      return Number(a?.maxValue) - Number(b?.maxValue);
    });
    if (!infos.length) return null;
    const numGet: any[] = ['to-number', propertyGetExpression(field), 0];
    const colorExpr: any[] = ['case'];
    const radiusExpr: any[] = ['case'];
    const strokeWExpr: any[] = ['case'];
    const strokeColExpr: any[] = ['case'];
    const opExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const sym = br?.symbol;
      const ol = symbolOutlineStyle(sym);
      const fc = symbolFillColor(sym) || ol.color || fallbackColor;
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, fc);
      radiusExpr.push(cond, symbolMarkerRadius(sym));
      strokeWExpr.push(cond, ol.color ? Math.max(0.5, ol.width) : 0);
      strokeColExpr.push(cond, ol.color || 'rgba(15, 23, 42, 0.72)');
      opExpr.push(cond, defaultFillOpacity(sym));
    }
    const defSym = ren.defaultSymbol;
    const defOl = symbolOutlineStyle(defSym);
    colorExpr.push(symbolFillColor(defSym) || defOl.color || fallbackColor);
    radiusExpr.push(symbolMarkerRadius(defSym));
    strokeWExpr.push(defOl.color ? Math.max(0.5, defOl.width) : 0);
    strokeColExpr.push(defOl.color || 'rgba(15, 23, 42, 0.72)');
    opExpr.push(defaultFillOpacity(defSym));
    return {
      'circle-color': colorExpr,
      'circle-radius': radiusExpr,
      'circle-stroke-width': strokeWExpr,
      'circle-stroke-color': strokeColExpr,
      'circle-opacity': opExpr,
    };
  }

  return null;
}

/** True when Mapbox can paint from ArcGIS `drawingInfo` (fill, line, or point/circle). */
export function arcgisDrawingInfoSupportsMapboxRender(drawingInfo: unknown): boolean {
  if (!drawingInfo || typeof drawingInfo !== 'object') return false;
  return (
    arcgisDrawingInfoToFillPaint(drawingInfo) !== null ||
    arcgisDrawingInfoToLinePaint(drawingInfo, '') !== null ||
    arcgisDrawingInfoToCirclePaint(drawingInfo, '') !== null
  );
}

/** True when Mapbox can paint this layer from ArcGIS service symbology (not app default palette). */
export function arcgisLayerUsesServiceSymbology(layer: {
  source?: string;
  useArcGisSymbology?: boolean;
  arcgisDrawingInfo?: unknown;
  symbology?: { useArcGisOnline?: boolean; userConfigured?: boolean };
}): boolean {
  if (layer.symbology?.useArcGisOnline === false || layer.useArcGisSymbology === false) return false;
  if (!layer.arcgisDrawingInfo || !arcgisDrawingInfoSupportsMapboxRender(layer.arcgisDrawingInfo)) return false;
  if (layer.symbology?.useArcGisOnline === true || layer.useArcGisSymbology === true) return true;
  if (layer.source === 'arcgis') return true;
  if (layer.symbology?.userConfigured === true) return false;
  return true;
}

export type ArcgisMapboxFillPaint = {
  'fill-color': string | any[];
  'fill-opacity': number | any[];
  'fill-outline-color'?: string | any[];
}

export type ArcgisMapboxLinePaint = {
  'line-color': string | any[];
  'line-width': number | any[];
  'line-opacity'?: number | any[];
}

/** Returns null if renderer is unsupported or missing — caller should fall back to solid layer color. */
export function arcgisDrawingInfoToFillPaint(drawingInfo: any): ArcgisMapboxFillPaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const col = symbolFillColor(ren.symbol);
    if (!col) return null;
    if (esriPolygonFillIsHollow(ren.symbol)) {
      return { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0 };
    }
    return { 'fill-color': col, 'fill-opacity': defaultFillOpacity(ren.symbol) };
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const defSym = ren.defaultSymbol;
    const defCol = esriPolygonFillIsHollow(defSym)
      ? 'rgba(0,0,0,0)'
      : symbolFillColor(defSym) || 'rgba(0,0,0,0)';
    const defOp = esriPolygonFillIsHollow(defSym) ? 0 : defaultFillOpacity(defSym);
    const colorExpr: any[] = ['match', fieldExpr];
    const opExpr: any[] = ['match', fieldExpr];
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(
      0,
      ARCGIS_MAX_UNIQUE_VALUE_INFOS,
    );
    const pushedKeys = new Set<string>();
    for (const uvi of infos) {
      const hollow = esriPolygonFillIsHollow(uvi.symbol);
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillColor(uvi.symbol) || defCol;
      const fo = hollow ? 0 : defaultFillOpacity(uvi.symbol);
      const ol = symbolOutlineStyle(uvi.symbol);
      const oc = ol.color || 'rgba(0,0,0,0)';
      for (const v of uniqueValueInfoKeys(uvi)) {
        if (!v || pushedKeys.has(v)) continue;
        pushedKeys.add(v);
        colorExpr.push(v, fc);
        opExpr.push(v, fo);
      }
    }
    colorExpr.push(defCol);
    opExpr.push(defOp);
    const outlineExpr: any[] = ['match', fieldExpr];
    let hasOutline = false;
    const pushedOutline = new Set<string>();
    for (const uvi of infos) {
      const ol = symbolOutlineStyle(uvi.symbol);
      const oc = ol.color || 'rgba(0,0,0,0)';
      for (const v of uniqueValueInfoKeys(uvi)) {
        if (!v || pushedOutline.has(v)) continue;
        pushedOutline.add(v);
        outlineExpr.push(v, oc);
        if (ol.color) hasOutline = true;
      }
    }
    const defOl = symbolOutlineStyle(defSym);
    outlineExpr.push(defOl.color || 'rgba(0,0,0,0)');
    if (defOl.color) hasOutline = true;
    const out: ArcgisMapboxFillPaint = { 'fill-color': colorExpr, 'fill-opacity': opExpr };
    if (hasOutline) out['fill-outline-color'] = outlineExpr;
    return out;
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).slice(
      0,
      ARCGIS_MAX_CLASS_BREAK_INFOS,
    );
    if (!rawInfos.length) return null;
    const infos = [...rawInfos].filter((br: any) => Number.isFinite(Number(br?.maxValue))).sort((a: any, b: any) => {
      const ma = Number(a?.minValue);
      const mb = Number(b?.minValue);
      if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
      return Number(a?.maxValue) - Number(b?.maxValue);
    });
    if (!infos.length) return null;
    const numGet: any[] = ['to-number', propertyGetExpression(field), 0];
    const colorExpr: any[] = ['case'];
    const opExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const sym = br?.symbol;
      const hollow = esriPolygonFillIsHollow(sym);
      const fc = hollow ? 'rgba(0,0,0,0)' : symbolFillColor(sym) ?? 'rgba(0,0,0,0)';
      const fo = hollow || fc === 'rgba(0,0,0,0)' ? 0 : defaultFillOpacity(sym);
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, fc);
      opExpr.push(cond, fo);
    }
    const defSym = ren.defaultSymbol;
    const defHollow = esriPolygonFillIsHollow(defSym);
    const defFill = defHollow ? 'rgba(0,0,0,0)' : symbolFillColor(defSym) ?? 'rgba(0,0,0,0)';
    colorExpr.push(defFill);
    opExpr.push(defHollow || defFill === 'rgba(0,0,0,0)' ? 0 : defaultFillOpacity(defSym));
    return { 'fill-color': colorExpr, 'fill-opacity': opExpr };
  }

  return null;
}

export function arcgisDrawingInfoToLinePaint(drawingInfo: any, fallbackLineColor: string): ArcgisMapboxLinePaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const outline = symbolOutlineStyle(ren.symbol);
    const fillCol = symbolFillColor(ren.symbol);
    const lineCol = outline.color || fillCol || fallbackLineColor;
    return { 'line-color': lineCol, 'line-width': outline.width, 'line-opacity': 0.9 };
  }

  if (t === 'uniqueValue') {
    const fieldExpr = uniqueValueKeyExpression(ren);
    const defSym = ren.defaultSymbol;
    const defOutline = symbolOutlineStyle(defSym);
    const defCol = defOutline.color || symbolFillColor(defSym) || fallbackLineColor;
    const defW = defOutline.width;
    const colorExpr: any[] = ['match', fieldExpr];
    const widthExpr: any[] = ['match', fieldExpr];
    const infos = (Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : []).slice(
      0,
      ARCGIS_MAX_UNIQUE_VALUE_INFOS,
    );
    const pushedLine = new Set<string>();
    for (const uvi of infos) {
      const ol = symbolOutlineStyle(uvi.symbol);
      const lc = ol.color || symbolFillColor(uvi.symbol) || defCol;
      const lw = ol.width;
      for (const v of uniqueValueInfoKeys(uvi)) {
        if (!v || pushedLine.has(v)) continue;
        pushedLine.add(v);
        colorExpr.push(v, lc);
        widthExpr.push(v, lw);
      }
    }
    colorExpr.push(defCol);
    widthExpr.push(defW);
    return { 'line-color': colorExpr, 'line-width': widthExpr, 'line-opacity': 0.95 };
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return null;
    const rawInfos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []).slice(
      0,
      ARCGIS_MAX_CLASS_BREAK_INFOS,
    );
    const infos = [...rawInfos].filter((br: any) => Number.isFinite(Number(br?.maxValue))).sort((a: any, b: any) => {
      const ma = Number(a?.minValue);
      const mb = Number(b?.minValue);
      if (Number.isFinite(ma) && Number.isFinite(mb)) return ma - mb;
      return Number(a?.maxValue) - Number(b?.maxValue);
    });
    if (!infos.length) return null;
    const numGet: any[] = ['to-number', propertyGetExpression(field), 0];
    const colorExpr: any[] = ['case'];
    const widthExpr: any[] = ['case'];
    for (const br of infos) {
      const maxV = Number(br?.maxValue);
      const minV = Number(br?.minValue);
      const low = Number.isFinite(minV) ? minV : Number(ren?.minValue) || -1e15;
      if (!Number.isFinite(maxV)) continue;
      const sym = br?.symbol;
      const ol = symbolOutlineStyle(sym);
      const lc = ol.color || symbolFillColor(sym) || fallbackLineColor;
      const lw = ol.width;
      const cond: any[] = ['all', ['>=', numGet, low], ['<=', numGet, maxV]];
      colorExpr.push(cond, lc);
      widthExpr.push(cond, lw);
    }
    const defO = symbolOutlineStyle(ren.defaultSymbol);
    colorExpr.push(defO.color || symbolFillColor(ren.defaultSymbol) || fallbackLineColor);
    widthExpr.push(defO.width);
    return { 'line-color': colorExpr, 'line-width': widthExpr, 'line-opacity': 0.95 };
  }

  return null;
}

/** Full layer/table JSON from `GET {layerUrl}?f=pjson` (fields, types, domains, drawingInfo, …). */
export async function fetchArcgisLayerPjson(sourceUrl: string, authToken?: string): Promise<any | null> {
  const u = sourceUrl.replace(/\/?$/, '');
  let url = `${u}?f=pjson`;
  if (authToken?.trim()) {
    const parsed = new URL(url);
    parsed.searchParams.set('token', authToken.trim());
    url = parsed.toString();
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/** Persist only schema needed for domain/subtype labels (Geo AI + GIS Content). */
export function slimArcgisLayerDefinitionForStorage(pjson: any) {
  if (!pjson || typeof pjson !== 'object') return undefined;
  const fields = Array.isArray(pjson.fields) ? pjson.fields : [];
  const types = Array.isArray(pjson.types) ? pjson.types : [];
  const typeIdField = typeof pjson.typeIdField === 'string' ? pjson.typeIdField : undefined;
  if (!fields.length && !types.length && !typeIdField) return undefined;
  return {
    fields,
    types,
    typeIdField,
    geometryType: pjson.geometryType,
    name: pjson.name,
  };
}

export async function fetchArcgisLayerDrawingInfo(sourceUrl: string, authToken?: string): Promise<any | null> {
  const json = await fetchArcgisLayerPjson(sourceUrl, authToken);
  if (json?.drawingInfo && typeof json.drawingInfo === 'object') return json.drawingInfo;
  if (json?.renderer && typeof json.renderer === 'object') return { renderer: json.renderer };
  return null;
}
