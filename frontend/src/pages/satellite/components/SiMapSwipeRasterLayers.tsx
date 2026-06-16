import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Layer, Source, useMap } from 'react-map-gl/mapbox';
import {
  SI_MAP_SWIPE_WMS_LAYER_A_ID,
  SI_MAP_SWIPE_WMS_LAYER_B_ID,
  SI_MAP_SWIPE_WMS_SOURCE_A_ID,
  SI_MAP_SWIPE_WMS_SOURCE_B_ID,
} from '../utils/siMapLayerSwipeCatalog';
import { buildSiMapSwipeWmsTileUrl, siMapSwipeSideOpacity } from '../utils/siMapSwipeWmsSide';
import type { SiMapSwipeSideConfig } from '../stores/siMapSwipeStore';
import { useSiMapSwipeStore } from '../stores/siMapSwipeStore';
import {
  syncSiMapSwipeCompareLayerStack,
  syncSiMapSwipeRasterSourceTiles,
  type SiMapSwipeRasterSideSync,
} from '../utils/siMapSwipeCompareLayerStack';
import { scheduleSiMapInteractionOverlayFrame, isSiMapDataLayerMutationFrozen } from '../utils/siMapRasterPipelineGuard';
import { resolveSiMapboxMap } from '../utils/siMapRenderSync';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM } from '../../../lib/siSentinelHubWmsMapZoom';

export type SiMapSwipeRasterLayersProps = {
  active: boolean;
  isMapLoaded: boolean;
  layerA: SiMapSwipeSideConfig;
  layerB: SiMapSwipeSideConfig;
  wmsBaseUrl: string;
  cloudCoverage: number;
  clipGeometry: unknown;
  wmsRasterAoiBoundsLngLat: [number, number, number, number] | null;
  drawVisualOpacity: number;
  wmsLayersCatalog: { name: string; title?: string }[];
  symStopsForLayerId: (layerId: string) => readonly IndexRampStop[] | null;
  symOpacityForLayerId: (layerId: string) => number;
  defaultDateIso: string;
};

function sideBaseOpacity(
  clipEvalscript: string | null | undefined,
  hasAoiBounds: boolean,
  drawVisualOpacity: number,
  symOpacity: number,
): number {
  return (clipEvalscript ? 1 : 0.85) * (hasAoiBounds ? drawVisualOpacity : 1) * symOpacity;
}

function SideRaster({
  sourceId,
  layerId,
  tileUrl,
  visible,
  opacity,
  bounds,
}: {
  sourceId: string;
  layerId: string;
  tileUrl: string;
  visible: boolean;
  opacity: number;
  bounds?: [number, number, number, number];
}) {
  if (!visible || !tileUrl) return null;
  return (
    <Source
      id={sourceId}
      type="raster"
      tiles={[tileUrl]}
      tileSize={512}
      scheme="xyz"
      minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
      bounds={bounds ?? undefined}
    >
      <Layer
        id={layerId}
        type="raster"
        source={sourceId}
        minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
        paint={{
          'raster-opacity': opacity,
          'raster-fade-duration': 0,
        }}
      />
    </Source>
  );
}

/** Dedicated Layer A / Layer B WMS stacks — tile URLs update via Mapbox `setTiles`. */
export function SiMapSwipeRasterLayers(props: SiMapSwipeRasterLayersProps) {
  const {
    active,
    isMapLoaded,
    layerA,
    layerB,
    wmsBaseUrl,
    cloudCoverage,
    clipGeometry,
    wmsRasterAoiBoundsLngLat,
    drawVisualOpacity,
    wmsLayersCatalog,
    symStopsForLayerId,
    symOpacityForLayerId,
    defaultDateIso,
  } = props;

  const { current: map } = useMap();
  const bumpLayersMount = useSiMapSwipeStore(s => s.bumpLayersMount);
  const hasAoiBounds = Boolean(wmsRasterAoiBoundsLngLat);

  const tileUrlA = useMemo(() => {
    if (!active || !layerA.visible || !wmsBaseUrl?.trim()) return '';
    return buildSiMapSwipeWmsTileUrl({
      logicalLayerId: layerA.layerId,
      dateIso: layerA.dateIso || defaultDateIso,
      wmsBaseUrl,
      cloudCoverage,
      drawnGeometry: clipGeometry,
      wmsLayersCatalog,
      symStops: symStopsForLayerId(layerA.layerId),
      symOpacity: layerA.opacity,
    });
  }, [
    active,
    layerA.layerId,
    layerA.dateIso,
    layerA.visible,
    layerA.opacity,
    defaultDateIso,
    wmsBaseUrl,
    cloudCoverage,
    clipGeometry,
    wmsLayersCatalog,
    symStopsForLayerId,
  ]);

  const tileUrlB = useMemo(() => {
    if (!active || !layerB.visible || !wmsBaseUrl?.trim()) return '';
    return buildSiMapSwipeWmsTileUrl({
      logicalLayerId: layerB.layerId,
      dateIso: layerB.dateIso || defaultDateIso,
      wmsBaseUrl,
      cloudCoverage,
      drawnGeometry: clipGeometry,
      wmsLayersCatalog,
      symStops: symStopsForLayerId(layerB.layerId),
      symOpacity: layerB.opacity,
    });
  }, [
    active,
    layerB.layerId,
    layerB.dateIso,
    layerB.visible,
    layerB.opacity,
    defaultDateIso,
    wmsBaseUrl,
    cloudCoverage,
    clipGeometry,
    wmsLayersCatalog,
    symStopsForLayerId,
  ]);

  const opacityA = useMemo(() => {
    const clip = symStopsForLayerId(layerA.layerId);
    const hasEval = Boolean(clip?.length);
    return siMapSwipeSideOpacity(
      sideBaseOpacity(hasEval ? '1' : null, hasAoiBounds, drawVisualOpacity, layerA.opacity * symOpacityForLayerId(layerA.layerId)),
    );
  }, [layerA.layerId, layerA.opacity, symOpacityForLayerId, symStopsForLayerId, hasAoiBounds, drawVisualOpacity]);

  const opacityB = useMemo(() => {
    const clip = symStopsForLayerId(layerB.layerId);
    const hasEval = Boolean(clip?.length);
    return siMapSwipeSideOpacity(
      sideBaseOpacity(hasEval ? '1' : null, hasAoiBounds, drawVisualOpacity, layerB.opacity * symOpacityForLayerId(layerB.layerId)),
    );
  }, [layerB.layerId, layerB.opacity, symOpacityForLayerId, symStopsForLayerId, hasAoiBounds, drawVisualOpacity]);

  const boundsSync = wmsRasterAoiBoundsLngLat ?? null;

  const sideSyncRef = useRef<{ sideA: SiMapSwipeRasterSideSync | null; sideB: SiMapSwipeRasterSideSync | null }>({
    sideA: null,
    sideB: null,
  });
  sideSyncRef.current = {
    sideA: tileUrlA ? { tileUrl: tileUrlA, opacity: opacityA, visible: layerA.visible, bounds: boundsSync } : null,
    sideB: tileUrlB ? { tileUrl: tileUrlB, opacity: opacityB, visible: layerB.visible, bounds: boundsSync } : null,
  };

  const flushSwipeRasterSync = useCallback(() => {
    if (!active || !isMapLoaded || !map) return false;
    const m = resolveSiMapboxMap(map);
    if (!m) return false;
    const { sideA, sideB } = sideSyncRef.current;
    return syncSiMapSwipeRasterSourceTiles(m, sideA, sideB);
  }, [active, isMapLoaded, map]);

  const scheduleStackSync = useCallback(() => {
    scheduleSiMapInteractionOverlayFrame(() => {
      const mapInstance = resolveSiMapboxMap(map);
      if (!mapInstance || isSiMapDataLayerMutationFrozen()) return;
      syncSiMapSwipeCompareLayerStack(mapInstance);
      bumpLayersMount();
    });
  }, [map, bumpLayersMount]);

  useLayoutEffect(() => {
    if (!active || !isMapLoaded || !map) return;
    flushSwipeRasterSync();
    if (!isSiMapDataLayerMutationFrozen()) {
      scheduleStackSync();
    }
  }, [
    active,
    isMapLoaded,
    map,
    tileUrlA,
    tileUrlB,
    opacityA,
    opacityB,
    layerA.visible,
    layerB.visible,
    boundsSync,
    flushSwipeRasterSync,
    scheduleStackSync,
  ]);

  useEffect(() => {
    if (!active || !isMapLoaded) return;
    const m = resolveSiMapboxMap(map);
    if (!m) return;
    const onIdle = () => {
      flushSwipeRasterSync();
      if (!isSiMapDataLayerMutationFrozen()) {
        syncSiMapSwipeCompareLayerStack(m);
      }
    };
    m.once('idle', onIdle);
    return () => {
      try {
        m.off('idle', onIdle);
      } catch {
        /* ignore */
      }
    };
  }, [
    active,
    isMapLoaded,
    map,
    tileUrlA,
    tileUrlB,
    opacityA,
    opacityB,
    layerA.visible,
    layerB.visible,
    boundsSync,
    flushSwipeRasterSync,
  ]);

  if (!active || !isMapLoaded) return null;

  return (
    <>
      <SideRaster
        sourceId={SI_MAP_SWIPE_WMS_SOURCE_A_ID}
        layerId={SI_MAP_SWIPE_WMS_LAYER_A_ID}
        tileUrl={tileUrlA}
        visible={layerA.visible}
        opacity={opacityA}
        bounds={wmsRasterAoiBoundsLngLat ?? undefined}
      />
      <SideRaster
        sourceId={SI_MAP_SWIPE_WMS_SOURCE_B_ID}
        layerId={SI_MAP_SWIPE_WMS_LAYER_B_ID}
        tileUrl={tileUrlB}
        visible={layerB.visible}
        opacity={opacityB}
        bounds={wmsRasterAoiBoundsLngLat ?? undefined}
      />
    </>
  );
}
