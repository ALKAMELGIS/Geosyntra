/**
 * Map ArcGIS Feature Layer `drawingInfo` (as returned by `.../layer/{id}?f=pjson`)
 * to Mapbox GL JS paint props for GeoJSON fill/line layers (subset of renderers).
 */

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

export type ArcgisMapboxFillPaint = {
  'fill-color': string | any[];
  'fill-opacity': number;
}

export type ArcgisMapboxLinePaint = {
  'line-color': string | any[];
  'line-width': number;
  'line-opacity'?: number;
}

/** Returns null if renderer is unsupported or missing — caller should fall back to solid layer color. */
export function arcgisDrawingInfoToFillPaint(drawingInfo: any): ArcgisMapboxFillPaint | null {
  const ren = drawingInfo?.renderer;
  if (!ren || typeof ren !== 'object') return null;
  const t = String(ren.type || '');

  if (t === 'simple') {
    const col = symbolFillColor(ren.symbol);
    if (!col) return null;
    return { 'fill-color': col, 'fill-opacity': defaultFillOpacity(ren.symbol) };
  }

  if (t === 'uniqueValue') {
    const field = typeof ren.field1 === 'string' && ren.field1.trim() ? ren.field1.trim() : '';
    if (!field) return null;
    const defCol = symbolFillColor(ren.defaultSymbol) || '#64748b';
    const expr: any[] = ['match', ['to-string', ['get', field]]];
    const infos = Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : [];
    for (const uvi of infos) {
      const v = uvi?.value;
      if (v === undefined || v === null) continue;
      const sc = symbolFillColor(uvi.symbol);
      expr.push(String(v), sc || defCol);
    }
    expr.push(defCol);
    return { 'fill-color': expr, 'fill-opacity': 0.42 };
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
    const field = typeof ren.field1 === 'string' && ren.field1.trim() ? ren.field1.trim() : '';
    if (!field) return null;
    const defOutline = symbolOutlineStyle(ren.defaultSymbol);
    const defCol = defOutline.color || symbolFillColor(ren.defaultSymbol) || fallbackLineColor;
    const expr: any[] = ['match', ['to-string', ['get', field]]];
    const infos = Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : [];
    for (const uvi of infos) {
      const v = uvi?.value;
      if (v === undefined || v === null) continue;
      const ol = symbolOutlineStyle(uvi.symbol);
      const lc = ol.color || symbolFillColor(uvi.symbol) || defCol;
      expr.push(String(v), lc);
    }
    expr.push(defCol);
    return { 'line-color': expr, 'line-width': 1.25, 'line-opacity': 0.9 };
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
  return json?.drawingInfo && typeof json.drawingInfo === 'object' ? json.drawingInfo : null;
}
