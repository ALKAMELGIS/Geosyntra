import type { ArcgisLayerDefLite } from '../../lib/arcgisAttributeDisplay';
import { resolveIdentifyPopupTitle } from '../../lib/arcgisAttributeDisplay';
import type { GeoExplorerMapLink } from '../../lib/geoExplorerContracts';
import { buildGeoAiInspectCardContent } from '../../lib/siLayerPopupInspect';
import type { SiLayerPopupConfig } from '../../lib/siLayerPopupConfig';
import { computeStableGisFeatureKey } from '../../lib/gisFeatureStableKey';
import { pickGeoAiHumanPlaceFields } from '../../lib/geoExplorerLayerContext';
import {
  dedupePreparedIdentifyHits,
  isClusterLayerHit,
  isWorkspaceMultiAoiLayerHit,
  prepareMapIdentifyHit,
  rankIdentifyHits,
  siIdentifyLayerIsSkippable,
  siVectorLayerIdToCustomSourceId,
  type MapboxIdentifyFeature,
} from './siMapFeatureIdentify';

export type SatelliteIdentifyCard = {
  title: string;
  rows: { label: string; value: string }[];
  inspect?: ReturnType<typeof buildGeoAiInspectCardContent>['inspect'];
  lng: number;
  lat: number;
  areaName?: string;
  country?: string;
};

export type SatelliteIdentifyCandidate = {
  id: string;
  title: string;
  card: SatelliteIdentifyCard;
  featureLinkKey: string | null;
  tableLink: GeoExplorerMapLink | null;
};

export type CustomLayerIdentifyLite = {
  id: string;
  name: string;
  geojson?: { features?: unknown[] };
  popupConfig?: SiLayerPopupConfig | null;
  arcgisLayerDefinition?: ArcgisLayerDefLite | null;
};

export type RunSatelliteMapIdentifyCtx = {
  lng: number;
  lat: number;
  getMap: () => {
    project?: (lngLat: [number, number]) => { x: number; y: number };
    queryRenderedFeatures?: (
      geometry: [number, number] | [number, number][],
      opts?: { layers?: string[] },
    ) => MapboxIdentifyFeature[];
    getSource?: (id: string) => {
      getClusterExpansionZoom?: (id: number, cb: (err: Error | null, zoom: number) => void) => void;
    };
    easeTo?: (o: { center: [number, number]; zoom: number; duration?: number }) => void;
  } | null;
  queryableLayerIds: string[];
  customLayers: CustomLayerIdentifyLite[];
  resolveTitle: (layerId: string) => string;
  resolveArcgisDef: (layerId: string) => ArcgisLayerDefLite | null;
  queryContext: string | null;
  sanitizeProperties: (raw: Record<string, unknown>) => Record<string, unknown>;
  /** Merge workspace / sketch attributes when rendered hit carries only ids. */
  enrichIdentifyProperties?: (layerId: string, props: Record<string, unknown>) => Record<string, unknown>;
  shouldSuppressPopup: () => boolean;
  onMergeInspect: (
    card: SatelliteIdentifyCard,
    link: GeoExplorerMapLink | null,
    extras?: { candidates?: SatelliteIdentifyCandidate[]; activeCandidateId?: string },
  ) => void;
  onTableFocusKey: (key: string | null) => void;
  /** Side-effect only — must not block the attribute popup. */
  onMultiAoiSelect?: (layerId: string, props: Record<string, unknown>) => void;
  onDrawnIndexSelect?: (layerId: string, props: Record<string, unknown>) => void;
  /** STAC footprint pick may consume the click (no attribute popup). */
  handleStacHit: (props: Record<string, unknown>) => boolean;
  expandClusterAt: (layerId: string, props: Record<string, unknown>, lng: number, lat: number) => boolean;
};

const FEATURE_ID_FIELDS = ['OBJECTID', 'ObjectId', 'objectid', 'FID', 'fid', 'Id', 'ID', 'id'] as const;

function normalizedPropertySubset(
  raw: Record<string, unknown>,
  sanitize: (r: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  const clean = sanitize(raw);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (!k || k.startsWith('_') || k.startsWith('mapbox_')) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function propertiesLooselyMatch(
  hitProps: Record<string, unknown>,
  featureProps: Record<string, unknown>,
): boolean {
  for (const k of FEATURE_ID_FIELDS) {
    const hv = hitProps[k];
    const fv = featureProps[k];
    if (hv != null && hv !== '' && fv != null && fv !== '' && String(hv) === String(fv)) return true;
  }
  const hitKeys = Object.keys(hitProps);
  if (!hitKeys.length) return false;
  return hitKeys.every(k => JSON.stringify(hitProps[k]) === JSON.stringify(featureProps[k]));
}

/** Resolve stable feature key + table link for a map identify hit on a custom vector layer. */
export function findCustomLayerFeatureLink(
  layer: CustomLayerIdentifyLite,
  hitProperties: Record<string, unknown>,
  sanitizeProperties: (raw: Record<string, unknown>) => Record<string, unknown>,
): { featureLinkKey: string; tableLink: GeoExplorerMapLink } | null {
  const feats = layer.geojson?.features;
  if (!Array.isArray(feats) || !feats.length) return null;
  const want = normalizedPropertySubset(hitProperties, sanitizeProperties);
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { properties?: Record<string, unknown> };
    const props =
      f?.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)
        ? normalizedPropertySubset(f.properties, sanitizeProperties)
        : {};
    if (!propertiesLooselyMatch(want, props)) continue;
    const fk = computeStableGisFeatureKey(f, i);
    const layerId = String(layer.id);
    return {
      featureLinkKey: `${layerId}::${fk}`,
      tableLink: { type: 'feature', layerId, featureKey: fk },
    };
  }
  return null;
}

function resolveFeatureLink(
  hit: ReturnType<typeof prepareMapIdentifyHit>,
  customLayers: CustomLayerIdentifyLite[],
  sanitizeProperties: (raw: Record<string, unknown>) => Record<string, unknown>,
): { featureLinkKey: string | null; tableLink: GeoExplorerMapLink | null } {
  const customHitLayer = customLayers.find(l => String(l.id) === hit?.baseLayerId);
  if (!customHitLayer) {
    return { featureLinkKey: null, tableLink: null };
  }
  const resolved = findCustomLayerFeatureLink(customHitLayer, hit.properties, sanitizeProperties);
  if (!resolved) return { featureLinkKey: null, tableLink: null };
  return resolved;
}

function buildCardForHit(
  hit: NonNullable<ReturnType<typeof prepareMapIdentifyHit>>,
  ctx: RunSatelliteMapIdentifyCtx,
  arcDef: ArcgisLayerDefLite | null,
  customLayer: CustomLayerIdentifyLite | undefined,
): SatelliteIdentifyCard {
  const built = buildGeoAiInspectCardContent({
    properties: hit.properties,
    arcgisLayerDefinition: arcDef,
    popupConfig: customLayer?.popupConfig ?? undefined,
    queryContext: ctx.queryContext,
    inspectCoords: { lng: ctx.lng, lat: ctx.lat },
  });
  const layerDisplayName = customLayer?.name?.trim() || hit.title;
  return {
    title: layerDisplayName,
    rows: built.rows,
    inspect: built.inspect,
    lng: ctx.lng,
    lat: ctx.lat,
    ...pickGeoAiHumanPlaceFields(hit.properties),
  };
}

const IDENTIFY_QUERY_PAD_PX = 14

function queryIdentifyHitsAtPoint(
  map: NonNullable<ReturnType<RunSatelliteMapIdentifyCtx['getMap']>>,
  lng: number,
  lat: number,
  layerIds: string[],
): MapboxIdentifyFeature[] {
  const pt = map.project!([lng, lat])
  const pad = IDENTIFY_QUERY_PAD_PX
  const box: [[number, number], [number, number]] = [
    [pt.x - pad, pt.y - pad],
    [pt.x + pad, pt.y + pad],
  ]
  const queryWithLayers = (ids: string[] | undefined, geometry: [[number, number], [number, number]] | [number, number]) => {
    const opts = ids && ids.length > 0 ? { layers: ids } : undefined
    let batch = map.queryRenderedFeatures!(geometry, opts) ?? []
    if (!batch.length && ids && ids.length > 0) {
      batch = map.queryRenderedFeatures!(geometry) ?? []
      batch = batch.filter(h => !siIdentifyLayerIsSkippable(String(h?.layer?.id ?? '')))
      if (ids.length > 0) {
        const idSet = new Set(ids)
        batch = batch.filter(h => idSet.has(String(h?.layer?.id ?? '')))
      }
    }
    if (!opts) {
      batch = batch.filter(h => !siIdentifyLayerIsSkippable(String(h?.layer?.id ?? '')))
    }
    return batch
  }

  let hits = queryWithLayers(layerIds.length > 0 ? layerIds : undefined, box)
  if (!hits.length) {
    hits = queryWithLayers(layerIds.length > 0 ? layerIds : undefined, [pt.x, pt.y])
  }
  return hits
}

/** Query map layers at click; open identify popup(s). Returns true if click was handled. */
export function runSatelliteMapIdentify(ctx: RunSatelliteMapIdentifyCtx): boolean {
  const map = ctx.getMap()
  if (!map?.project || !map.queryRenderedFeatures) return false

  try {
    let hits = queryIdentifyHitsAtPoint(map, ctx.lng, ctx.lat, ctx.queryableLayerIds)
    const ranked = rankIdentifyHits(hits)

    const isWorkspaceMultiHit = (h: MapboxIdentifyFeature | undefined) => {
      if (!h) return false;
      const lid = String(h.layer?.id ?? '');
      const props =
        h.properties && typeof h.properties === 'object' && !Array.isArray(h.properties)
          ? (h.properties as Record<string, unknown>)
          : {};
      return isWorkspaceMultiAoiLayerHit(lid, props);
    };

    const customLayerIds = new Set(ctx.customLayers.map(l => String(l.id)));
    const customVectorHit = ranked.find(h => {
      const lid = String(h?.layer?.id ?? '');
      const base = siVectorLayerIdToCustomSourceId(lid) ?? lid.replace(/-(fill|line|circle|cluster|cluster-count)$/, '');
      return customLayerIds.has(base);
    });

    const multiHit = ranked.find(isWorkspaceMultiHit);
    const primary = customVectorHit ?? multiHit ?? ranked[0];
    if (!primary) return false;

    const layerId = String(primary.layer?.id ?? '');
    if (!layerId || siIdentifyLayerIsSkippable(layerId)) return false;

    const rawProps =
      primary.properties && typeof primary.properties === 'object' && !Array.isArray(primary.properties)
        ? (primary.properties as Record<string, unknown>)
        : {};
    const clean = ctx.enrichIdentifyProperties
      ? ctx.enrichIdentifyProperties(layerId, ctx.sanitizeProperties(rawProps))
      : ctx.sanitizeProperties(rawProps);

    if (isClusterLayerHit(layerId)) {
      if (ctx.expandClusterAt(layerId, rawProps, ctx.lng, ctx.lat)) return true;
    }

    if (layerId.startsWith('si-multi-aoi-') && isWorkspaceMultiAoiLayerHit(layerId, clean)) {
      ctx.onMultiAoiSelect?.(layerId, clean);
    }

    if (layerId.startsWith('drawn-index-geometry')) {
      ctx.onDrawnIndexSelect?.(layerId, clean);
    }

    if (layerId.startsWith('si-stac-footprints')) {
      if (ctx.handleStacHit(clean)) return true;
    }

    const preparedList: NonNullable<ReturnType<typeof prepareMapIdentifyHit>>[] = [];
    for (const h of ranked) {
      const p = prepareMapIdentifyHit(h, ctx.resolveTitle);
      if (p) preparedList.push(p);
    }
    const unique = dedupePreparedIdentifyHits(preparedList).slice(0, 12);
    if (!unique.length) return false;

    const candidates: SatelliteIdentifyCandidate[] = unique.map((hit, i) => {
      const customLayer = ctx.customLayers.find(l => String(l.id) === hit.baseLayerId);
      const arcDef = ctx.resolveArcgisDef(hit.baseLayerId);
      const card = buildCardForHit(hit, ctx, arcDef, customLayer);
      const { featureLinkKey, tableLink } = resolveFeatureLink(hit, ctx.customLayers, ctx.sanitizeProperties);
      return {
        id: `hit-${i}-${hit.baseLayerId}`,
        title: customLayer?.name?.trim() || hit.title,
        card,
        featureLinkKey,
        tableLink,
      };
    });

    const primaryCand = candidates[0]!;
    ctx.onTableFocusKey(primaryCand.featureLinkKey);
    if (!ctx.shouldSuppressPopup()) {
      ctx.onMergeInspect(primaryCand.card, primaryCand.tableLink, {
        candidates,
        activeCandidateId: primaryCand.id,
      });
    }
    return true;
  } catch {
    return false;
  }
}
