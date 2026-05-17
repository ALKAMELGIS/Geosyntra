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

function layerNameMatchesKeywords(name: string, keywords: readonly string[]): boolean {
  const u = name.toUpperCase();
  return keywords.some(k => u.includes(k.toUpperCase()));
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
 * Sentinel Hub uses live GetCapabilities layers; other providers use catalog + WMS bridge.
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
    const out: RemoteSensingLayerOption[] = [];
    const seen = new Set<string>();
    for (const layer of visible) {
      const name = String(layer.name || '').trim();
      if (!name) continue;
      const entry = findSentinelCatalogEntryForWmsName(providerId, name);
      if (!entry) continue;
      const dedupe = entry.catalogId;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const label = String(layer.title || entry.label).trim() || entry.label;
      out.push({
        id: name,
        label,
        catalogId: entry.catalogId,
        providerId,
        nativeWms: true,
      });
    }
    if (out.length) return out;
    return provider.supportedLayers.map(entry => {
      const match = findWmsLayerForCatalogEntry(entry, visible);
      return {
        id: match?.name?.trim() || entry.catalogId,
        label: entry.label,
        catalogId: entry.catalogId,
        providerId,
        nativeWms: !!match,
      };
    });
  }

  const out: RemoteSensingLayerOption[] = [];
  for (const entry of provider.supportedLayers) {
    const match = findWmsLayerForCatalogEntry(entry, visible);
    out.push({
      id: match?.name?.trim() || `${providerId}:${entry.catalogId}`,
      label: entry.label,
      catalogId: entry.catalogId,
      providerId,
      nativeWms: !!match,
    });
  }
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
