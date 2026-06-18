import type { SentinelHubWmsLayerInfo } from '../../../../lib/sentinelHubWmsCapabilities';
import {
  SI_LAYER_LIVE_COMPOSITE_CATALOG,
  isLayerLiveCompositeLayerId,
} from '../../../../lib/siLayerLiveCompositeCatalog';
import {
  SI_SENTINEL1_INSAR_LAYER_CATALOG,
  isSentinel1GrdCollection,
  isSentinel1InsarLayerId,
  isSentinel1NativeWmsLayerName,
  filterRedundantSentinel1HhHvWmsLayers,
  resolveSentinel1GrdWmsTileLayerName,
  resolveSentinel1NativeWmsTileLayerName,
} from '../../../../lib/siSentinel1InsarLayerCatalog';
import {
  getSatelliteProvider,
  isSentinelHubProvider,
  type SatelliteProviderId,
  type SatelliteProviderLayerCatalogEntry,
} from './provider-capabilities';

export type RemoteSensingLayerOption = {
  /** WMS layer name used for map tiles (resolved). */
  id: string;
  label: string;
  /** Short scientific code shown in Layer Live pickers (e.g. VHS, ΔVHS). */
  sciCode?: string;
  groupKey?: string;
  groupLabel?: string;
  groupOrder?: number;
  /** Sort order inside a Layer Live group (catalog sequence). */
  layerOrder?: number;
  catalogId: string;
  providerId: SatelliteProviderId;
  /** False when bridged from another provider's catalog. */
  nativeWms: boolean;
};

/** Sentinel Hub display title — default RS layer after the user draws an AOI. */
export const SI_DEFAULT_AOI_DRAW_WMS_LAYER_LABEL = 'Highlight Optimized Natural Color';

export type RemoteSensingLayerOptionLite = Pick<RemoteSensingLayerOption, 'id' | 'label'>;

/** Eval-only Layer Live indices (computed via EVALSCRIPT when absent from GetCapabilities). */
export type LayerLiveEvalLayerDef = {
  id: string;
  label: string;
  catalogId: string;
  groupKey?: string;
  groupLabel?: string;
  groupOrder?: number;
  layerOrder?: number;
  /** Keywords to pick a WMS `LAYERS=` fallback that exposes required spectral bands. */
  tileFallbackKeywords: readonly string[];
};

export const SI_LAYER_LIVE_EVAL_LAYER_DEFS: readonly LayerLiveEvalLayerDef[] = [
  {
    id: 'SAVI',
    label: 'SAVI',
    catalogId: 'savi',
    groupKey: 'core',
    groupLabel: '📊 Core indices',
    groupOrder: 0.5,
    layerOrder: 4,
    tileFallbackKeywords: ['TRUE_COLOR', 'SENTINEL-2', 'L2A', 'NDVI'],
  },
];

export function isLayerLiveEvalOnlyLayerId(id: string): boolean {
  const u = String(id || '').trim().toUpperCase();
  if (isLayerLiveCompositeLayerId(u)) return true;
  if (isSentinel1InsarLayerId(u)) return true;
  return SI_LAYER_LIVE_EVAL_LAYER_DEFS.some(d => d.id.toUpperCase() === u);
}

/** Filter GetCapabilities to the active sensor collection. */
export function filterWmsLayersForSatelliteCollection(
  wmsLayers: readonly SentinelHubWmsLayerInfo[],
  collectionId: string,
): SentinelHubWmsLayerInfo[] {
  if (!isSentinel1GrdCollection(collectionId)) {
    return wmsLayers.filter(l => !isSentinel1NativeWmsLayerName(l.name));
  }
  const s1 = filterRedundantSentinel1HhHvWmsLayers(
    wmsLayers.filter(l => isSentinel1NativeWmsLayerName(l.name)),
  );
  return s1.length ? s1 : [];
}

/** Append Sentinel-1 InSAR / SAR-derived eval layers for Layer Live. */
export function appendSentinel1InsarLayerOptions(
  options: RemoteSensingLayerOption[],
  providerId: SatelliteProviderId,
): RemoteSensingLayerOption[] {
  if (!isSentinelHubProvider(providerId)) return options;
  const out = [...options];
  const seenIds = new Set(options.map(o => o.id.toUpperCase()));
  const seenLabelKeys = new Set(options.map(o => normalizeLayerLabelKey(o.label)));

  for (const def of SI_SENTINEL1_INSAR_LAYER_CATALOG) {
    if (seenIds.has(def.id.toUpperCase())) continue;
    const labelKey = normalizeLayerLabelKey(def.title);
    if (!labelKey || seenLabelKeys.has(labelKey)) continue;
    out.push({
      id: def.id,
      label: def.title,
      sciCode: def.sciCode,
      groupKey: def.groupKey,
      groupLabel: def.groupLabel,
      groupOrder: def.groupOrder,
      layerOrder: def.layerOrder,
      catalogId: def.id.toLowerCase(),
      providerId,
      nativeWms: false,
    });
    seenIds.add(def.id.toUpperCase());
    seenLabelKeys.add(labelKey);
  }
  return out;
}

/**
 * Collection-aware Layer Live extensions — S1 GRD shows InSAR catalog; optical collections keep S2 composites.
 */
export function appendCollectionLayerLiveOptions(
  options: RemoteSensingLayerOption[],
  providerId: SatelliteProviderId,
  collectionId: string,
): RemoteSensingLayerOption[] {
  if (!isSentinelHubProvider(providerId)) return options;
  if (isSentinel1GrdCollection(collectionId)) {
    return appendSentinel1InsarLayerOptions(options, providerId);
  }
  return appendLayerLiveEvalLayerOptions(options, providerId);
}

/** Append virtual eval layers (SAVI + agro composites) when absent from GetCapabilities. */
export function appendLayerLiveEvalLayerOptions(
  options: RemoteSensingLayerOption[],
  providerId: SatelliteProviderId,
): RemoteSensingLayerOption[] {
  if (!isSentinelHubProvider(providerId)) return options;
  const out = [...options];
  const seenIds = new Set(options.map(o => o.id.toUpperCase()));
  const seenLabelKeys = new Set(options.map(o => normalizeLayerLabelKey(o.label)));

  for (const def of SI_LAYER_LIVE_EVAL_LAYER_DEFS) {
    if (seenIds.has(def.id.toUpperCase())) continue;
    const labelKey = normalizeLayerLabelKey(def.label);
    if (!labelKey || seenLabelKeys.has(labelKey)) continue;
    out.push({
      id: def.id,
      label: def.label,
      sciCode: def.id,
      groupKey: def.groupKey,
      groupLabel: def.groupLabel,
      groupOrder: def.groupOrder,
      layerOrder: def.layerOrder,
      catalogId: def.catalogId,
      providerId,
      nativeWms: false,
    });
    seenIds.add(def.id.toUpperCase());
    seenLabelKeys.add(labelKey);
  }

  for (const def of SI_LAYER_LIVE_COMPOSITE_CATALOG) {
    if (seenIds.has(def.id.toUpperCase())) continue;
    const labelKey = normalizeLayerLabelKey(def.title);
    if (!labelKey || seenLabelKeys.has(labelKey)) continue;
    out.push({
      id: def.id,
      label: def.title,
      sciCode: def.sciCode,
      groupKey: def.groupKey,
      groupLabel: def.groupLabel,
      groupOrder: def.groupOrder,
      layerOrder: def.layerOrder,
      catalogId: def.id.toLowerCase(),
      providerId,
      nativeWms: false,
    });
    seenIds.add(def.id.toUpperCase());
    seenLabelKeys.add(labelKey);
  }

  return out;
}

/** WMS `LAYERS=` name for GetMap — logical id when native, otherwise a spectral fallback layer. */
export function resolveWmsTileLayerName(
  logicalLayerId: string,
  wmsLayers: readonly SentinelHubWmsLayerInfo[],
): string {
  const id = String(logicalLayerId || '').trim();
  if (!id) return '';
  if (wmsLayers.some(l => l.name === id)) {
    return resolveSentinel1NativeWmsTileLayerName(id, wmsLayers);
  }

  if (isLayerLiveEvalOnlyLayerId(id)) {
    if (isSentinel1InsarLayerId(id)) {
      return resolveSentinel1GrdWmsTileLayerName(wmsLayers);
    }
    const evalDef = SI_LAYER_LIVE_EVAL_LAYER_DEFS.find(d => d.id.toUpperCase() === id.toUpperCase());
    const keywords = evalDef?.tileFallbackKeywords ?? ['TRUE_COLOR', 'SENTINEL-2', 'L2A', 'NDVI'];
    for (const kw of keywords) {
      const match = wmsLayers.find(l => l.name.toUpperCase().includes(kw.toUpperCase()));
      if (match?.name?.trim()) return match.name.trim();
    }
  }

  const ndvi = wmsLayers.find(l => l.name.toUpperCase().includes('NDVI'));
  if (ndvi?.name?.trim()) return ndvi.name.trim();
  const natural = wmsLayers.find(l => {
    const u = l.name.toUpperCase();
    return u.includes('TRUE_COLOR') || u.includes('NATURAL');
  });
  if (natural?.name?.trim()) return natural.name.trim();
  return wmsLayers.find(l => l.name.trim().length > 0)?.name.trim() ?? id;
}

/** Resolve WMS layer id for the post–AOI-draw default (exact title, then keyword fallback). */
export function resolveDefaultAoiDrawWmsLayerId(
  options: readonly RemoteSensingLayerOptionLite[],
): string | null {
  if (!options.length) return null;
  const exact = options.find(
    o =>
      o.label.localeCompare(SI_DEFAULT_AOI_DRAW_WMS_LAYER_LABEL, undefined, { sensitivity: 'base' }) ===
      0,
  );
  if (exact?.id?.trim()) return exact.id.trim();
  const fuzzy = options.find(o => {
    const blob = `${o.label} ${o.id}`.toUpperCase();
    return (
      blob.includes('HIGHLIGHT') &&
      blob.includes('OPTIMIZED') &&
      (blob.includes('NATURAL') || blob.includes('TRUE_COLOR') || blob.includes('TRUE COLOR'))
    );
  });
  return fuzzy?.id?.trim() || null;
}

function layerNameMatchesKeywords(name: string, keywords: readonly string[]): boolean {
  const u = name.toUpperCase();
  return keywords.some(k => u.includes(k.toUpperCase()));
}

/** Case-insensitive label key — collapses API duplicates (e.g. "False color" / "False Color"). */
export function normalizeLayerLabelKey(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isNdwiMoistureWmsLayer(name: string, title: string): boolean {
  const n = String(name || '').trim().toUpperCase();
  const t = String(title || '').trim();
  if (!n && !t) return false;
  if (n === 'NDWI' || n.includes('NDWI') || n.includes('MNDWI')) return true;
  if (/Moisture\s+Index\s*\(NDWI\)/i.test(t)) return true;
  if (/NDWI/i.test(t) && /Moisture/i.test(t)) return true;
  return false;
}

/** User-facing WMS layer title (short index codes where API titles are verbose). */
export function normalizeWmsLayerDisplayTitle(name: string, title: string): string {
  const n = String(name || '').trim();
  const t = String(title || '').trim();
  if (!t) return n;
  if (isNdwiMoistureWmsLayer(n, t)) return 'NDWI';
  if (/^Moisture\s+Index(\s*\(NDMI\))?$/i.test(t)) return 'NDMI';
  if ((n === 'NDMI' || /NDMI/i.test(n) || /^MOISTURE/i.test(n)) && /^Moisture\s+index$/i.test(t)) {
    return 'NDMI';
  }
  return t;
}

function wmsLayerDisplayLabel(layer: SentinelHubWmsLayerInfo): string {
  const title = String(layer.title || '').trim();
  const name = String(layer.name || '').trim();
  return normalizeWmsLayerDisplayTitle(name, title) || name;
}

function findWmsLayerForCatalogEntry(
  entry: SatelliteProviderLayerCatalogEntry,
  wmsLayers: readonly SentinelHubWmsLayerInfo[],
): SentinelHubWmsLayerInfo | null {
  for (const layer of wmsLayers) {
    const name = String(layer.name || '').trim();
    if (!name) continue;
    if (layerNameMatchesKeywords(name, entry.wmsKeywords)) return layer;
  }
  return null;
}

function findSentinelCatalogEntryForWmsName(
  providerId: SatelliteProviderId,
  wmsName: string,
): SatelliteProviderLayerCatalogEntry | null {
  const provider = getSatelliteProvider(providerId);
  for (const entry of provider.supportedLayers) {
    if (layerNameMatchesKeywords(wmsName, entry.wmsKeywords)) return entry;
  }
  return null;
}

/**
 * Build layer dropdown options for the active satellite provider.
 * Only includes layers backed by WMS GetCapabilities (Sentinel Hub or bridged names).
 * No static catalog placeholders when the API returns nothing.
 */
export function buildProviderLayerOptions(
  providerId: SatelliteProviderId,
  wmsLayers: readonly SentinelHubWmsLayerInfo[],
  hiddenLayerIds: ReadonlySet<string>,
  collectionId?: string,
): RemoteSensingLayerOption[] {
  const provider = getSatelliteProvider(providerId);
  const scopedWms =
    collectionId && isSentinelHubProvider(providerId)
      ? filterWmsLayersForSatelliteCollection(wmsLayers, collectionId)
      : [...wmsLayers];
  const visible = scopedWms.filter(
    l => !hiddenLayerIds.has(String(l.name || '').trim().toUpperCase()),
  );

  if (isSentinelHubProvider(providerId)) {
    /** Layer list — Sentinel Hub GetCapabilities only (title from API; no static catalog labels). */
    const out: RemoteSensingLayerOption[] = [];
    const seenNames = new Set<string>();
    const seenLabelKeys = new Set<string>();
    for (const layer of visible) {
      const name = String(layer.name || '').trim();
      if (!name || seenNames.has(name)) continue;
      const label = wmsLayerDisplayLabel(layer);
      const labelKey = normalizeLayerLabelKey(label);
      if (!labelKey || seenLabelKeys.has(labelKey)) continue;
      seenNames.add(name);
      seenLabelKeys.add(labelKey);
      const entry = findSentinelCatalogEntryForWmsName(providerId, name);
      out.push({
        id: name,
        label,
        catalogId: entry?.catalogId ?? name,
        providerId,
        nativeWms: true,
      });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return out;
  }

  /** Other providers: only layers bridged to a live WMS name from GetCapabilities. */
  const out: RemoteSensingLayerOption[] = [];
  for (const entry of provider.supportedLayers) {
    const match = findWmsLayerForCatalogEntry(entry, visible);
    const wmsName = match?.name?.trim();
    if (!wmsName) continue;
    out.push({
      id: wmsName,
      label: String(match.title || entry.label).trim() || wmsName,
      catalogId: entry.catalogId,
      providerId,
      nativeWms: true,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return out;
}

export function resolveWmsLayerIdForOption(
  option: RemoteSensingLayerOption | undefined,
  wmsLayers: readonly SentinelHubWmsLayerInfo[],
): string {
  if (!option) return '';
  if (option.nativeWms && option.id && wmsLayers.some(l => l.name === option.id)) return option.id;
  const match = findWmsLayerForCatalogEntry(
    {
      catalogId: option.catalogId,
      label: option.label,
      wmsKeywords: getSatelliteProvider(option.providerId).supportedLayers.find(
        e => e.catalogId === option.catalogId,
      )?.wmsKeywords ?? [option.label],
    },
    wmsLayers,
  );
  return match?.name?.trim() ?? '';
}
