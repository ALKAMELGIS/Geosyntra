import { useLayoutEffect, useMemo, useRef } from 'react';
import { Layer, Source, useMap } from 'react-map-gl/mapbox';
import {
  raiseSiMapWmsRasterLayersToTop,
  refreshSiMapWmsRasterPaint,
  syncSiMapWmsRasterSourceBounds,
  syncSiMapWmsRasterSourceTiles,
} from '../utils/siMapWmsRasterLayerStack';
import { syncSiMapOverlayLayerStack } from '../utils/siMapCustomVectorLayerStack';
import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import { sentinelHubWmsUsesMaxCloudCover } from '../../../lib/siSentinel1InsarLayerCatalog';
import { SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM } from '../../../lib/siSentinelHubWmsMapZoom';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { isSiTimelinePlaybackBlocked } from '../utils/siMapCaptureSession';
import { SI_WMS_CROSSFADE_MS, type SiTimelineTransitionMode } from '../utils/useSiWmsTimelineCrossfade';
import {
  resolveSiMapboxMap,
  waitForSiMapWmsRunsSettled,
} from '../utils/siMapRenderSync';
import {
  siMapWmsRasterLayerIdForRun,
  siMapWmsRasterSourceIdForRun,
} from '../utils/siMapWmsRasterLayerStack';

export type SiSentinelHubRasterRunLite = {
  aoiId: string;
  stackKey: string;
  wmsLayerId: string;
  timeStart: string;
  timeEnd: string;
  tileUrl: string;
  bounds: [number, number, number, number] | null;
  clip: { evalscriptB64?: string | null; geometryWkt3857?: string | null };
  ready: boolean;
};

type SiSentinelHubRasterLayersProps = {
  isMapLoaded: boolean;
  sentinelVisible: boolean;
  drawnGeometry: unknown;
  activeWmsLayer: string;
  /** WMS `LAYERS=` param — may differ from `activeWmsLayer` for eval-only indices (e.g. SAVI). */
  wmsTileLayerName?: string;
  siMultiSentinelRasterRuns: SiSentinelHubRasterRunLite[] | null;
  drawnAoiWmsClipReady: boolean;
  wmsRasterAoiBoundsLngLat: [number, number, number, number] | null;
  drawVisualOpacity: number;
  symOpacityForWmsLayerId: (layerId: string) => number;
  symStopsForWmsLayerId: (layerId: string) => readonly IndexRampStop[] | null;
  wmsDate: string;
  siWmsMapTimeExtent: { start: string; end: string };
  timelineTransitionMode: SiTimelineTransitionMode;
  /** When false, raster remounts instantly on date change (no cached previous frame). */
  isTimelinePlaying?: boolean;
  cloudCoverage: number;
  wmsBaseUrl: string;
  evalscriptKeyPart: (b64: string | null | undefined) => string;
  /** @deprecated Tile URLs update in place via setTiles; kept for optional cache-bust hooks. */
  wmsTimelineFocusRev?: number;
  /** Fires when the active WMS stack finishes loading on the main map. */
  onRasterStackSettled?: () => void;
};

function buildLegacyWmsTileUrl(
  logicalLayerId: string,
  tileLayerName: string,
  clip: ReturnType<typeof buildSentinelHubWmsAoiClip>,
  wmsBaseUrl: string,
  timeExtent: { start: string; end: string },
  cloudCoverage: number,
): string {
  const safeLayer = encodeURIComponent(tileLayerName);
  const start = timeExtent.start;
  const end = timeExtent.end;
  const maxcc = sentinelHubWmsUsesMaxCloudCover(logicalLayerId, tileLayerName)
    ? `&MAXCC=${cloudCoverage}`
    : '';
  let url =
    `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${safeLayer}` +
    `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512` +
    `&TIME=${start}/${end}${maxcc}&SHOWLOGO=false&WARNINGS=false`;
  if (clip.geometryWkt3857) {
    url += `&GEOMETRY=${encodeURIComponent(clip.geometryWkt3857)}`;
  }
  if (clip.evalscriptB64) {
    url += `&EVALSCRIPT=${encodeURIComponent(clip.evalscriptB64)}`;
  }
  return url;
}

function legacyBaseOpacity(
  clip: ReturnType<typeof buildSentinelHubWmsAoiClip>,
  drawnGeometry: unknown,
  wmsRasterAoiBoundsLngLat: [number, number, number, number] | null,
  drawVisualOpacity: number,
  symOpacity: number,
): number {
  return (
    (clip.evalscriptB64 ? 1 : 0.85) *
    (drawnGeometry != null && wmsRasterAoiBoundsLngLat ? drawVisualOpacity : 1) *
    symOpacity
  );
}

/**
 * Sentinel Hub WMS raster tiles: multi-AOI stack + legacy single AOI.
 * Smooth mode uses one raster source + Mapbox `raster-fade-duration` (no dual tile stacks).
 */
export function SiSentinelHubRasterLayers(props: SiSentinelHubRasterLayersProps) {
  const {
    isMapLoaded,
    sentinelVisible,
    drawnGeometry,
    activeWmsLayer,
    wmsTileLayerName,
    siMultiSentinelRasterRuns,
    drawnAoiWmsClipReady,
    wmsRasterAoiBoundsLngLat,
    drawVisualOpacity,
    symOpacityForWmsLayerId,
    symStopsForWmsLayerId,
    siWmsMapTimeExtent,
    timelineTransitionMode,
    isTimelinePlaying = false,
    cloudCoverage,
    wmsBaseUrl,
    evalscriptKeyPart,
    wmsTimelineFocusRev = 0,
    onRasterStackSettled,
  } = props;

  const smooth = timelineTransitionMode === 'smooth';
  const effectiveLegacyWms = activeWmsLayer;

  const legacyClip = useMemo(
    () =>
      buildSentinelHubWmsAoiClip(drawnGeometry, effectiveLegacyWms, {
        indexVisibilityMin: null,
        classifiedStopsOverride: symStopsForWmsLayerId(effectiveLegacyWms) ?? undefined,
      }),
    [drawnGeometry, effectiveLegacyWms, symStopsForWmsLayerId],
  );

  const legacyStackKey = useMemo(
    () =>
      `${effectiveLegacyWms}-${siWmsMapTimeExtent.start}-${siWmsMapTimeExtent.end}-${wmsRasterAoiBoundsLngLat?.join(',') ?? 'world'}-${legacyClip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(legacyClip.evalscriptB64)}`,
    [effectiveLegacyWms, siWmsMapTimeExtent.start, siWmsMapTimeExtent.end, wmsRasterAoiBoundsLngLat, legacyClip, evalscriptKeyPart],
  );

  const legacyTileLayerName = wmsTileLayerName?.trim() || effectiveLegacyWms;
  const legacyTileUrl = useMemo(
    () =>
      buildLegacyWmsTileUrl(
        effectiveLegacyWms,
        legacyTileLayerName,
        legacyClip,
        wmsBaseUrl,
        siWmsMapTimeExtent,
        cloudCoverage,
      ),
    [legacyTileLayerName, legacyClip, wmsBaseUrl, siWmsMapTimeExtent, cloudCoverage],
  );

  const legacySymOpacity = symOpacityForWmsLayerId(effectiveLegacyWms || '');
  const legacyOpacity = legacyBaseOpacity(
    legacyClip,
    drawnGeometry,
    wmsRasterAoiBoundsLngLat,
    drawVisualOpacity,
    legacySymOpacity,
  );

  const captureFrozen = isSiTimelinePlaybackBlocked();
  /** Crossfade only during smooth playback; manual / last frame always instant. */
  const rasterFadeMs =
    captureFrozen || !isTimelinePlaying || !smooth ? 0 : Math.min(420, SI_WMS_CROSSFADE_MS);

  const { current: map } = useMap();
  const stackSyncFrameRef = useRef<number | null>(null);

  const scheduleOverlayStackSync = () => {
    if (stackSyncFrameRef.current != null) {
      window.cancelAnimationFrame(stackSyncFrameRef.current);
    }
    stackSyncFrameRef.current = window.requestAnimationFrame(() => {
      stackSyncFrameRef.current = null;
      const m = resolveSiMapboxMap(map);
      if (!m) return;
      raiseSiMapWmsRasterLayersToTop(m);
      syncSiMapOverlayLayerStack(m);
      refreshSiMapWmsRasterPaint(m);
    });
  };
  const readyRuns = useMemo(
    () => (siMultiSentinelRasterRuns ?? []).filter(s => s.ready && s.tileUrl),
    [siMultiSentinelRasterRuns],
  );
  /** Legacy single-stack WMS — fallback when multi-AOI stack is empty or has no ready runs. */
  const useMultiWmsStack = readyRuns.length > 0;
  const legacyWmsMounted = Boolean(activeWmsLayer?.trim()) && !useMultiWmsStack;
  const rasterStackKey = useMemo(
    () =>
      siMultiSentinelRasterRuns === null
        ? `legacy:${legacyStackKey}`
        : readyRuns.map(s => `${s.aoiId}:${s.stackKey}:${s.wmsLayerId}`).join('|'),
    [siMultiSentinelRasterRuns, readyRuns, legacyStackKey],
  );

  useLayoutEffect(() => {
    if (!isMapLoaded || !sentinelVisible || !map) return;
    syncSiMapWmsRasterSourceTiles(
      resolveSiMapboxMap(map)!,
      useMultiWmsStack ? readyRuns : null,
      legacyWmsMounted ? legacyTileUrl : null,
      { forceImmediate: true },
    );
    refreshSiMapWmsRasterPaint(resolveSiMapboxMap(map));
  }, [isMapLoaded, sentinelVisible, map, useMultiWmsStack, legacyWmsMounted, legacyTileUrl, readyRuns, wmsTimelineFocusRev]);

  useLayoutEffect(() => {
    if (!isMapLoaded || !sentinelVisible || !map) return;
    let cancelled = false;
    const runSync = () => {
      if (cancelled) return;
      if (useMultiWmsStack) {
        syncSiMapWmsRasterSourceBounds(map, readyRuns);
      } else if (legacyWmsMounted) {
        try {
          const src = map.getSource('sentinel-source') as
            | { setBounds?: (b: [number, number, number, number] | null) => void }
            | null;
          if (src && typeof src.setBounds === 'function') {
            src.setBounds(drawnAoiWmsClipReady ? (wmsRasterAoiBoundsLngLat ?? null) : null);
          }
        } catch {
          /* ignore */
        }
      }
      scheduleOverlayStackSync();
    };
    const settle = () => {
      if (cancelled) return;
      runSync();
      const sourceIds = useMultiWmsStack
        ? readyRuns.map(s => siMapWmsRasterSourceIdForRun(s))
        : legacyWmsMounted
          ? ['sentinel-source']
          : [];
      const layerIds = useMultiWmsStack
        ? readyRuns.map(s => siMapWmsRasterLayerIdForRun(s))
        : legacyWmsMounted
          ? ['sentinel-layer']
          : [];
      if (!sourceIds.length) return;
      void waitForSiMapWmsRunsSettled(resolveSiMapboxMap(map), sourceIds, layerIds, {
        rasterFadeMs: 0,
        extraFrames: 1,
      }).then(() => {
        if (!cancelled) onRasterStackSettled?.();
      });
    };
    const t = window.setTimeout(settle, 0);
    try {
      map.once('idle', settle);
    } catch {
      /* ignore */
    }
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (stackSyncFrameRef.current != null) {
        window.cancelAnimationFrame(stackSyncFrameRef.current);
        stackSyncFrameRef.current = null;
      }
    };
  }, [
    isMapLoaded,
    sentinelVisible,
    map,
    rasterStackKey,
    useMultiWmsStack,
    readyRuns,
    legacyWmsMounted,
    drawnAoiWmsClipReady,
    wmsRasterAoiBoundsLngLat,
    activeWmsLayer,
    onRasterStackSettled,
  ]);

  return (
    <>
      {isMapLoaded &&
        sentinelVisible &&
        useMultiWmsStack &&
        readyRuns.map(spec => {
          const stackKey = `${spec.aoiId}-${spec.stackKey}-${spec.wmsLayerId}-${spec.bounds?.join(',') ?? 'nb'}-${spec.clip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(spec.clip.evalscriptB64)}`;
          const opacity =
            (spec.clip.evalscriptB64 ? 1 : 0.85) * (spec.bounds ? drawVisualOpacity : 1) * symOpacityForWmsLayerId(spec.wmsLayerId);

          return (
            <Source
              key={stackKey}
              id={`si-sentinel-src-${spec.aoiId}-${spec.stackKey}`}
              type="raster"
              tiles={[spec.tileUrl]}
              tileSize={512}
              minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
              bounds={spec.bounds ?? undefined}
            >
              <Layer
                id={`si-sentinel-layer-${spec.aoiId}-${spec.stackKey}`}
                type="raster"
                minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
                paint={{
                  'raster-opacity': opacity,
                  'raster-fade-duration': rasterFadeMs,
                }}
              />
            </Source>
          );
        })}

      {isMapLoaded && sentinelVisible && legacyWmsMounted ? (
        <Source
          key={`sentinel-legacy-${effectiveLegacyWms}`}
          id="sentinel-source"
          type="raster"
          tiles={[legacyTileUrl]}
          tileSize={512}
          minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
          bounds={wmsRasterAoiBoundsLngLat ?? undefined}
        >
          <Layer
            id="sentinel-layer"
            type="raster"
            minzoom={SI_SENTINEL_HUB_WMS_MAP_MIN_ZOOM}
            paint={{
              'raster-opacity': legacyOpacity,
              'raster-fade-duration': rasterFadeMs,
            }}
          />
        </Source>
      ) : null}
    </>
  );
}
