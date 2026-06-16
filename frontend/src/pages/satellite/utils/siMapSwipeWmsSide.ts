import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import { sentinelHubWmsUsesMaxCloudCover } from '../../../lib/siSentinel1InsarLayerCatalog';
import { resolveWmsTileLayerName } from '../utils/satellite/provider-layer-mapper';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';

export type SiMapSwipeWmsSideInput = {
  logicalLayerId: string;
  dateIso: string;
  wmsBaseUrl: string;
  cloudCoverage: number;
  drawnGeometry: unknown;
  wmsLayersCatalog: { name: string; title?: string }[];
  symStops?: readonly IndexRampStop[] | null;
  symOpacity?: number;
};

/** Single-day Sentinel TIME extent for swipe side raster. */
export function siMapSwipeTimeExtentForDate(dateIso: string): { start: string; end: string } {
  const day = String(dateIso || '').trim().slice(0, 10);
  if (!day) {
    const now = new Date().toISOString().slice(0, 10);
    return { start: `${now}T00:00:00Z`, end: `${now}T23:59:59Z` };
  }
  return { start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z` };
}

export function buildSiMapSwipeWmsTileUrl(input: SiMapSwipeWmsSideInput): string {
  const logicalLayerId = input.logicalLayerId.trim();
  const tileLayerName = resolveWmsTileLayerName(logicalLayerId, input.wmsLayersCatalog);
  const clip = buildSentinelHubWmsAoiClip(input.drawnGeometry, logicalLayerId, {
    indexVisibilityMin: null,
    classifiedStopsOverride: input.symStops ?? undefined,
  });
  const time = siMapSwipeTimeExtentForDate(input.dateIso);
  const safeLayer = encodeURIComponent(tileLayerName);
  const maxcc = sentinelHubWmsUsesMaxCloudCover(logicalLayerId, tileLayerName)
    ? `&MAXCC=${input.cloudCoverage}`
    : '';
  let url =
    `${input.wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${safeLayer}` +
    `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512` +
    `&TIME=${time.start}/${time.end}${maxcc}&SHOWLOGO=false&WARNINGS=false`;
  if (clip.geometryWkt3857) url += `&GEOMETRY=${encodeURIComponent(clip.geometryWkt3857)}`;
  if (clip.evalscriptB64) url += `&EVALSCRIPT=${encodeURIComponent(clip.evalscriptB64)}`;
  return url;
}

export function siMapSwipeSideOpacity(symOpacity = 1): number {
  return Math.max(0.05, Math.min(1, symOpacity));
}
