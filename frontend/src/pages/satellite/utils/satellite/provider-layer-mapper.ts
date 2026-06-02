import type { SentinelHubWmsLayerInfo } from '../../../../lib/sentinelHubWmsCapabilities';
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
  catalogId: string;
  providerId: SatelliteProviderId;
  /** False when bridged from another provider's catalog. */
  nativeWms: boolean;
};

/** Sentinel Hub display title — default RS layer after the user draws an AOI. */
export const SI_DEFAULT_AOI_DRAW_WMS_LAYER_LABEL = 'Highlight Optimized Natural Color';

export type RemoteSensingLayerOptionLite = Pick<RemoteSensingLayerOption, 'id' | 'label'>;

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

function wmsLayerDisplayLabel(layer: SentinelHubWmsLayerInfo): string {
  const title = String(layer.title || '').trim();
  const name = String(layer.name || '').trim();
  return title || name;
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
): RemoteSensingLayerOption[] {
  const provider = getSatelliteProvider(providerId);
  const visible = wmsLayers.filter(
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
