import { useEffect, useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import {
  SI_WMS_CROSSFADE_MS,
  useSiWmsTimelineCrossfade,
  type SiTimelineTransitionMode,
} from '../utils/useSiWmsTimelineCrossfade';

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
  siMultiSentinelRasterRuns: SiSentinelHubRasterRunLite[] | null;
  drawnAoiWmsClipReady: boolean;
  wmsRasterAoiBoundsLngLat: [number, number, number, number] | null;
  drawVisualOpacity: number;
  symOpacityForWmsLayerId: (layerId: string) => number;
  symStopsForWmsLayerId: (layerId: string) => readonly IndexRampStop[] | null;
  wmsDate: string;
  siWmsMapTimeExtent: { start: string; end: string };
  timelineTransitionMode: SiTimelineTransitionMode;
  cloudCoverage: number;
  wmsBaseUrl: string;
  evalscriptKeyPart: (b64: string | null | undefined) => string;
};

function buildLegacyWmsTileUrl(
  layerId: string,
  clip: ReturnType<typeof buildSentinelHubWmsAoiClip>,
  wmsBaseUrl: string,
  timeExtent: { start: string; end: string },
  cloudCoverage: number,
): string {
  const safeLayer = encodeURIComponent(layerId);
  const start = timeExtent.start;
  const end = timeExtent.end;
  let url =
    `${wmsBaseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${safeLayer}` +
    `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=512&HEIGHT=512` +
    `&TIME=${start}/${end}&MAXCC=${cloudCoverage}&SHOWLOGO=false&WARNINGS=true`;
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
 * Smooth mode crossfades two time extents; step mode keeps instant layer swaps.
 */
export function SiSentinelHubRasterLayers(props: SiSentinelHubRasterLayersProps) {
  const {
    isMapLoaded,
    sentinelVisible,
    drawnGeometry,
    activeWmsLayer,
    siMultiSentinelRasterRuns,
    drawnAoiWmsClipReady,
    wmsRasterAoiBoundsLngLat,
    drawVisualOpacity,
    symOpacityForWmsLayerId,
    symStopsForWmsLayerId,
    wmsDate,
    siWmsMapTimeExtent,
    timelineTransitionMode,
    cloudCoverage,
    wmsBaseUrl,
    evalscriptKeyPart,
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
      `${effectiveLegacyWms}-${wmsRasterAoiBoundsLngLat?.join(',') ?? 'world'}-${legacyClip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(legacyClip.evalscriptB64)}`,
    [effectiveLegacyWms, wmsRasterAoiBoundsLngLat, legacyClip, evalscriptKeyPart],
  );

  const { frameFrom, frameTo, blend, snapTo } = useSiWmsTimelineCrossfade(siWmsMapTimeExtent, timelineTransitionMode);

  useEffect(() => {
    snapTo(siWmsMapTimeExtent);
  }, [legacyStackKey, snapTo]);

  const legacyTileUrlFrom = useMemo(
    () => buildLegacyWmsTileUrl(effectiveLegacyWms, legacyClip, wmsBaseUrl, frameFrom, cloudCoverage),
    [effectiveLegacyWms, legacyClip, wmsBaseUrl, frameFrom, cloudCoverage],
  );

  const legacyTileUrlTo = useMemo(
    () => buildLegacyWmsTileUrl(effectiveLegacyWms, legacyClip, wmsBaseUrl, frameTo, cloudCoverage),
    [effectiveLegacyWms, legacyClip, wmsBaseUrl, frameTo, cloudCoverage],
  );

  const legacyTileUrlStep = useMemo(
    () => buildLegacyWmsTileUrl(effectiveLegacyWms, legacyClip, wmsBaseUrl, siWmsMapTimeExtent, cloudCoverage),
    [effectiveLegacyWms, legacyClip, wmsBaseUrl, siWmsMapTimeExtent, cloudCoverage],
  );

  const legacySymOpacity = symOpacityForWmsLayerId(effectiveLegacyWms || '');
  const legacyOpacity = legacyBaseOpacity(
    legacyClip,
    drawnGeometry,
    wmsRasterAoiBoundsLngLat,
    drawVisualOpacity,
    legacySymOpacity,
  );

  const multiRasterFade = smooth ? Math.min(450, SI_WMS_CROSSFADE_MS) : 0;

  return (
    <>
      {isMapLoaded &&
        sentinelVisible &&
        siMultiSentinelRasterRuns != null &&
        siMultiSentinelRasterRuns.filter(s => s.ready).map(spec => {
          const stackKey = `${spec.aoiId}-${spec.stackKey}-${spec.wmsLayerId}-${spec.bounds?.join(',') ?? 'nb'}-${spec.clip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(spec.clip.evalscriptB64)}`;
          const sourceKey = smooth
            ? stackKey
            : `${stackKey}-${spec.timeStart}-${spec.timeEnd}`;
          const opacity =
            (spec.clip.evalscriptB64 ? 1 : 0.85) * (spec.bounds ? drawVisualOpacity : 1) * symOpacityForWmsLayerId(spec.wmsLayerId);

          return (
            <Source
              key={sourceKey}
              id={`si-sentinel-src-${spec.aoiId}-${spec.stackKey}`}
              type="raster"
              tiles={[spec.tileUrl]}
              tileSize={512}
              bounds={spec.bounds ?? undefined}
            >
              <Layer
                id={`si-sentinel-layer-${spec.aoiId}-${spec.stackKey}`}
                type="raster"
                paint={{
                  'raster-opacity': opacity,
                  'raster-fade-duration': multiRasterFade,
                }}
              />
            </Source>
          );
        })}

      {isMapLoaded && sentinelVisible && siMultiSentinelRasterRuns === null && drawnAoiWmsClipReady && smooth ? (
        <>
          <Source
            key={`sentinel-from-${legacyStackKey}`}
            id="sentinel-source-from"
            type="raster"
            tiles={[legacyTileUrlFrom]}
            tileSize={512}
            bounds={wmsRasterAoiBoundsLngLat ?? undefined}
          >
            <Layer
              id="sentinel-layer-from"
              type="raster"
              paint={{
                'raster-opacity': legacyOpacity * (1 - blend),
                'raster-fade-duration': 0,
              }}
            />
          </Source>
          <Source
            key={`sentinel-to-${legacyStackKey}`}
            id="sentinel-source-to"
            type="raster"
            tiles={[legacyTileUrlTo]}
            tileSize={512}
            bounds={wmsRasterAoiBoundsLngLat ?? undefined}
          >
            <Layer
              id="sentinel-layer-to"
              type="raster"
              paint={{
                'raster-opacity': legacyOpacity * blend,
                'raster-fade-duration': 0,
              }}
            />
          </Source>
        </>
      ) : null}

      {isMapLoaded && sentinelVisible && siMultiSentinelRasterRuns === null && drawnAoiWmsClipReady && !smooth ? (
        <Source
          key={`sentinel-${effectiveLegacyWms}-${wmsDate}-${wmsRasterAoiBoundsLngLat?.join(',') ?? 'world'}-${legacyClip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(legacyClip.evalscriptB64)}`}
          id="sentinel-source"
          type="raster"
          tiles={[legacyTileUrlStep]}
          tileSize={512}
          bounds={wmsRasterAoiBoundsLngLat ?? undefined}
        >
          <Layer
            id="sentinel-layer"
            type="raster"
            paint={{
              'raster-opacity': legacyOpacity,
              'raster-fade-duration': 0,
            }}
          />
        </Source>
      ) : null}
    </>
  );
}
