import { useEffect, useLayoutEffect, useRef } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import type { Map as MapboxMap } from 'mapbox-gl';
import {
  awaitSiCustomLayerMapViewReady,
  customLayerMapboxSourceId,
  customLayerMapboxStyleKey,
  flushSiCustomLayerOnMapCanvas,
  isSiCustomLayerMapRefreshInFlight,
  resolveSiCustomLayerMountOpts,
  type SiCustomLayerRegistryFields,
} from '../utils/siMapCustomLayerRegistry';
import { isSiMapCameraInteracting } from '../utils/siMapLayerCameraSyncGuard';
import { siMapLayerSyncElevation3dActive } from '../utils/siMapLayerElevation3dState';
import { resolveSiCustomLayerMapDisplayLayer } from '../utils/siMapLayerRefreshBuffer';

type Props = {
  layer: SiCustomLayerRegistryFields;
  /** When true, polygon layers with height attributes mount as fill-extrusion (3D). */
  elevation3d?: boolean;
  /** Called when Mapbox source/layers are mounted above the basemap (ArcGIS LayerView ready). */
  onViewReady?: (layerId: string, ok: boolean) => void;
};

/**
 * Pins custom GeoJSON above basemap/WMS once per stable render signature.
 * Does NOT listen to map idle/move/zoom — camera interaction must not refresh layers.
 */
export function SiMapCustomLayerViewSync({ layer, elevation3d = false, onViewReady }: Props) {
  const { current: mapRef } = useMap();
  const notifiedRef = useRef<string | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;

  const displayLayer = resolveSiCustomLayerMapDisplayLayer(layer);
  const renderSig = `${displayLayer.id}:${customLayerMapboxStyleKey(displayLayer)}:${displayLayer.visible !== false ? '1' : '0'}:${elevation3d ? '3d' : '2d'}`;

  useLayoutEffect(() => {
    if (displayLayer.visible === false) return;
    const map = (mapRef?.getMap?.() ?? mapRef) as MapboxMap | undefined;
    if (!map) return;

    const flushOnce = () => {
      const current = layerRef.current;
      if (isSiCustomLayerMapRefreshInFlight(current) && current.mapCommittedGeojson) return;
      if (isSiMapCameraInteracting() && !siMapLayerSyncElevation3dActive()) return;
      const display = resolveSiCustomLayerMapDisplayLayer(current);
      const mountOpts = resolveSiCustomLayerMountOpts(display, { elevation3d });
      flushSiCustomLayerOnMapCanvas(map, display, mountOpts);
    };

    flushOnce();
  }, [mapRef, renderSig, elevation3d, displayLayer.visible]);

  useEffect(() => {
    if (displayLayer.visible === false || !onViewReady) return;
    const map = (mapRef?.getMap?.() ?? mapRef) as MapboxMap | undefined;
    if (!map) return;

    notifiedRef.current = null;
    let cancelled = false;

    void (async () => {
      if (isSiMapCameraInteracting() && !siMapLayerSyncElevation3dActive()) return;
      const display = resolveSiCustomLayerMapDisplayLayer(layerRef.current);
      const mountOpts = resolveSiCustomLayerMountOpts(display, { elevation3d });
      const result = await awaitSiCustomLayerMapViewReady(map, display, mountOpts);
      if (cancelled) return;
      if (notifiedRef.current === renderSig) return;
      notifiedRef.current = renderSig;
      onViewReady(layerRef.current.id, result.ok);
    })();

    return () => {
      cancelled = true;
    };
  }, [mapRef, onViewReady, renderSig, elevation3d, displayLayer.visible]);

  return null;
}
