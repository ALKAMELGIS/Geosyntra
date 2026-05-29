import type { Map as MapboxMap } from 'mapbox-gl';
import type { SiSentinelHubRasterRunLite } from '../components/SiSentinelHubRasterLayers';

/** Mapbox layer ids for Sentinel Hub WMS rasters (always above AOI vectors). */
export function isSiMapWmsRasterLayerId(layerId: string): boolean {
  return layerId === 'sentinel-layer' || layerId.startsWith('si-sentinel-layer-');
}

/** Source ids paired with {@link isSiMapWmsRasterLayerId}. */
export function siMapWmsRasterSourceIdForRun(spec: SiSentinelHubRasterRunLite): string {
  return `si-sentinel-src-${spec.aoiId}-${spec.stackKey}`;
}

export function siMapWmsRasterLayerIdForRun(spec: SiSentinelHubRasterRunLite): string {
  return `si-sentinel-layer-${spec.aoiId}-${spec.stackKey}`;
}

/**
 * Move every WMS raster layer to the top of the Mapbox stack so AOI fills/lines cannot paint over
 * Live Index tiles during normal viewing.
 */
export function raiseSiMapWmsRasterLayersToTop(map: MapboxMap): void {
  if (!map.getStyle?.()) return;
  const style = map.getStyle();
  if (!style?.layers) return;
  const ids = style.layers.map(l => l.id).filter(isSiMapWmsRasterLayerId);
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.moveLayer(id);
    } catch {
      /* layer removed mid-style rebuild */
    }
  }
}

export function syncSiMapWmsRasterSourceBounds(
  map: MapboxMap,
  runs: SiSentinelHubRasterRunLite[] | null | undefined,
): void {
  if (!runs?.length) return;
  for (const spec of runs) {
    if (!spec.ready) continue;
    const srcId = siMapWmsRasterSourceIdForRun(spec);
    try {
      const src = map.getSource(srcId) as { setBounds?: (b: [number, number, number, number] | null) => void } | null;
      if (src && typeof src.setBounds === 'function') src.setBounds(spec.bounds ?? null);
    } catch {
      /* ignore map/source race during style rebuild */
    }
  }
}

export function refreshSiMapWmsRasterPaint(map: MapboxMap | null | undefined): void {
  if (!map) return;
  try {
    map.triggerRepaint?.();
  } catch {
    /* ignore */
  }
}
