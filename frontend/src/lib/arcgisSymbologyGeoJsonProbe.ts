import { pickRendererPrimaryField, uniqueValueInfoKeys } from './arcgisDrawingInfoMapbox';

function propertyKeyVariants(field: string): string[] {
  const f = field.trim();
  if (!f) return [];
  const underscored = f.replace(/\s+/g, '_');
  const noSpace = f.replace(/\s+/g, '');
  return Array.from(
    new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()]),
  ).filter(Boolean);
}

function readProperty(props: Record<string, unknown> | null | undefined, field: string): unknown {
  if (!props || typeof props !== 'object') return undefined;
  for (const k of propertyKeyVariants(field)) {
    if (k in props) return props[k];
  }
  return undefined;
}

/**
 * True when ArcGIS unique-value / class-breaks symbology references fields absent from GeoJSON
 * (common cause of “layer in list, nothing on map”).
 */
export function arcgisSymbologyLikelyInvisibleForGeoJson(
  drawingInfo: unknown,
  geojson: unknown,
): boolean {
  if (!drawingInfo || typeof drawingInfo !== 'object') return false;
  const ren = (drawingInfo as { renderer?: Record<string, unknown> }).renderer;
  if (!ren || typeof ren !== 'object') return false;
  const t = String(ren.type || '');
  const feats = (geojson as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(feats) || !feats.length) return false;

  const sample = feats.slice(0, 60);
  if (t === 'uniqueValue') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return true;
    const hasValue = sample.some(ft => {
      const v = readProperty((ft as { properties?: Record<string, unknown> }).properties, field);
      return v !== undefined && v !== null && String(v) !== '';
    });
    if (!hasValue) return true;
    const defSym = ren.defaultSymbol;
    const defHollow =
      !defSym ||
      (Array.isArray((defSym as { color?: unknown }).color) &&
        Number((defSym as { color?: number[] }).color?.[3]) === 0);
    if (defHollow) {
      const infos = Array.isArray(ren.uniqueValueInfos) ? ren.uniqueValueInfos : [];
      const keys = new Set<string>();
      for (const uvi of infos) {
        for (const k of uniqueValueInfoKeys(uvi)) keys.add(k);
      }
      const anyMatch = sample.some(ft => {
        const v = readProperty((ft as { properties?: Record<string, unknown> }).properties, field);
        return v !== undefined && v !== null && keys.has(String(v).trim());
      });
      return !anyMatch;
    }
    return false;
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren);
    if (!field) return true;
    return !sample.some(ft => {
      const v = readProperty((ft as { properties?: Record<string, unknown> }).properties, field);
      const n = Number(v);
      return Number.isFinite(n);
    });
  }

  return false;
}
