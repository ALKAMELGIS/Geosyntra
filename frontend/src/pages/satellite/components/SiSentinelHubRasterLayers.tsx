import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { isSiTimelinePlaybackBlocked } from '../utils/siMapCaptureSession';
import { SI_WMS_CROSSFADE_MS, type SiTimelineTransitionMode } from '../utils/useSiWmsTimelineCrossfade';

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
 * Smooth mode uses one raster source + Mapbox `raster-fade-duration` (no dual tile stacks).
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

  const legacyTileUrl = useMemo(
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

  const captureFrozen = isSiTimelinePlaybackBlocked();
  const rasterFadeMs = captureFrozen ? 0 : smooth ? Math.min(420, SI_WMS_CROSSFADE_MS) : 0;

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
                  'raster-fade-duration': rasterFadeMs,
                }}
              />
            </Source>
          );
        })}

      {isMapLoaded && sentinelVisible && siMultiSentinelRasterRuns === null && drawnAoiWmsClipReady ? (
        <Source
          key={
            smooth
              ? `sentinel-${legacyStackKey}`
              : `sentinel-${legacyStackKey}-${siWmsMapTimeExtent.start}-${siWmsMapTimeExtent.end}`
          }
          id="sentinel-source"
          type="raster"
          tiles={[legacyTileUrl]}
          tileSize={512}
          bounds={wmsRasterAoiBoundsLngLat ?? undefined}
        >
          <Layer
            id="sentinel-layer"
            type="raster"
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
