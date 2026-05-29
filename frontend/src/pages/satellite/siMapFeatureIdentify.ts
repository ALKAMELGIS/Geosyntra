/** Map identify helpers — rank hits, dedupe layers, build stable keys. */

export type MapboxIdentifyFeature = {
  layer?: { id?: string };
  properties?: Record<string, unknown>;
};

export type PreparedMapIdentifyHit = {
  layerId: string;
  baseLayerId: string;
  title: string;
  properties: Record<string, unknown>;
};

export function siVectorLayerIdToCustomSourceId(mapboxLayerId: string): string | null {
  const m = mapboxLayerId.match(/^(.+)-(fill|line|circle|cluster|cluster-count)$/);
  return m ? m[1]! : null;
}

export function siIdentifyLayerIsSkippable(layerId: string): boolean {
  if (!layerId) return true;
  if (layerId.startsWith('si-geo-ai-pin')) return true;
  if (layerId.startsWith('si-geo-ai-sel-')) return true;
  if (layerId.startsWith('si-draw-draft')) return true;
  if (layerId.startsWith('si-edit-handles')) return true;
  if (layerId.startsWith('si-aoi-transform-handles')) return true;
  if (layerId === 'sentinel-layer' || layerId.startsWith('si-sentinel-layer-') || layerId === 'si-stac-thumb-layer')
    return true;
  if (layerId === 'background') return true;
  return false;
}

export function rankIdentifyHits(hits: MapboxIdentifyFeature[]): MapboxIdentifyFeature[] {
  const prefer = (a: MapboxIdentifyFeature, b: MapboxIdentifyFeature) => {
    const la = String(a?.layer?.id ?? '');
    const lb = String(b?.layer?.id ?? '');
    const rank = (id: string) => {
      if (/-cluster-count$/.test(id)) return -2;
      if (/-cluster$/.test(id)) return -1;
      if (/-fill$/.test(id)) return 0;
      if (/-circle$/.test(id)) return 1;
      if (/-line$/.test(id)) return 2;
      if (id.startsWith('si-aoi-fields')) return 3;
      if (id.startsWith('si-multi-aoi')) return 4;
      if (id.startsWith('si-stac-footprints')) return 5;
      return 6;
    };
    return rank(la) - rank(lb);
  };
  return [...hits].sort(prefer);
}

export function prepareMapIdentifyHit(
  hit: MapboxIdentifyFeature,
  resolveTitle: (layerId: string) => string,
): PreparedMapIdentifyHit | null {
  const layerId = String(hit?.layer?.id ?? '');
  if (!layerId || siIdentifyLayerIsSkippable(layerId)) return null;
  const rawProps =
    hit.properties && typeof hit.properties === 'object' && !Array.isArray(hit.properties)
      ? hit.properties
      : {};
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawProps)) {
    if (k.startsWith('mapbox_')) continue;
    if (k === 'layer' || k === 'id' || k === 'source_layer') continue;
    properties[k] = v;
  }
  const baseLayerId = siVectorLayerIdToCustomSourceId(layerId) ?? layerId.replace(/-(fill|line|circle|cluster|cluster-count)$/, '');
  return {
    layerId,
    baseLayerId,
    title: resolveTitle(layerId),
    properties,
  };
}

export function dedupePreparedIdentifyHits(hits: PreparedMapIdentifyHit[]): PreparedMapIdentifyHit[] {
  const seen = new Set<string>();
  const out: PreparedMapIdentifyHit[] = [];
  for (const h of hits) {
    const key = `${h.baseLayerId}::${JSON.stringify(h.properties)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function isWorkspaceMultiAoiLayerHit(layerId: string, properties: Record<string, unknown>): boolean {
  if (!layerId.startsWith('si-multi-aoi-')) return false;
  if (layerId === 'si-multi-aoi-cluster' || layerId === 'si-multi-aoi-cluster-count') return false;
  return String(properties.aoiId ?? '').trim().length > 0;
}

export function isClusterLayerHit(layerId: string): boolean {
  return layerId.endsWith('-cluster') || layerId.endsWith('-cluster-count');
}
