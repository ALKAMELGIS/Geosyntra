import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import type { Map as MapboxMap } from 'mapbox-gl';
import {
  awaitSiCustomLayerMapViewReady,
  customLayerMapboxSourceId,
  customLayerMapboxStyleKey,
  flushSiCustomLayerOnMapCanvas,
  resolveSiCustomLayerMountOpts,
  type SiCustomLayerRegistryFields,
} from '../utils/siMapCustomLayerRegistry';

type Props = {
  layer: SiCustomLayerRegistryFields;
  /** When true, polygon layers with height attributes mount as fill-extrusion (3D). */
  elevation3d?: boolean;
  /** Called when Mapbox source/layers are mounted above the basemap (ArcGIS LayerView ready). */
  onViewReady?: (layerId: string, ok: boolean) => void;
};

/**
 * Runs after each custom GeoJSON source mounts — pins the layer above basemap/WMS and
 * signals when the Mapbox layer view is ready (ArcGIS `whenLayerView` equivalent).
 */
export function SiMapCustomLayerViewSync({ layer, elevation3d = false, onViewReady }: Props) {
  const { current: mapRef } = useMap();
  const notifiedRef = useRef<string | null>(null);

  const renderSig = `${layer.id}:${customLayerMapboxStyleKey(layer)}:${layer.visible !== false ? '1' : '0'}:${elevation3d ? '3d' : '2d'}:${countSig(layer)}`;
  const mountOpts = resolveSiCustomLayerMountOpts(layer, { elevation3d });

  useLayoutEffect(() => {
    if (layer.visible === false) return;
    const map = (mapRef?.getMap?.() ?? mapRef) as MapboxMap | undefined;
    if (!map) return;
    const sourceId = customLayerMapboxSourceId(layer);
    const flush = () => flushSiCustomLayerOnMapCanvas(map, layer, mountOpts);

    flush();

    const onSourceData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e?.sourceId !== sourceId) return;
      if (e.isSourceLoaded !== false) flush();
    };
    const onIdle = () => flush();

    map.on('sourcedata', onSourceData);
    map.on('idle', onIdle);
    try {
      map.triggerRepaint();
    } catch {
      /* ignore */
    }

    return () => {
      map.off('sourcedata', onSourceData);
      map.off('idle', onIdle);
    };
  }, [layer, mapRef, renderSig, elevation3d]);

  useEffect(() => {
    if (layer.visible === false || !onViewReady) return;
    const map = (mapRef?.getMap?.() ?? mapRef) as MapboxMap | undefined;
    if (!map) return;

    notifiedRef.current = null;
    let cancelled = false;

    void (async () => {
      const result = await awaitSiCustomLayerMapViewReady(map, layer, mountOpts);
      if (cancelled) return;
      if (notifiedRef.current === renderSig) return;
      notifiedRef.current = renderSig;
      onViewReady(layer.id, result.ok);
    })();

    return () => {
      cancelled = true;
    };
  }, [layer, mapRef, onViewReady, renderSig, elevation3d]);

  return null;
}

function countSig(layer: SiCustomLayerRegistryFields): number {
  const feats = (layer.geojson as { features?: unknown[] } | undefined)?.features;
  return Array.isArray(feats) ? feats.length : 0;
}
