import { useContext, useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';
import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import type { IndexRampStop } from '../../../lib/siWmsIndexClassificationRamp';
import { SiWmsSentinelSwipeContext } from './SiWmsSentinelSwipeContext';

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

/**
 * Sentinel Hub WMS raster tiles: multi-AOI stack (unchanged) + legacy single AOI (respects swipe context override).
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
    cloudCoverage,
    wmsBaseUrl,
    evalscriptKeyPart,
  } = props;

  const swipeOverride = useContext(SiWmsSentinelSwipeContext);
  const effectiveLegacyWms =
    swipeOverride && String(swipeOverride).trim().length > 0 ? String(swipeOverride).trim() : activeWmsLayer;

  const legacyClip = useMemo(
    () =>
      buildSentinelHubWmsAoiClip(drawnGeometry, effectiveLegacyWms, {
        indexVisibilityMin: null,
        classifiedStopsOverride: symStopsForWmsLayerId(effectiveLegacyWms) ?? undefined,
      }),
    [drawnGeometry, effectiveLegacyWms, symStopsForWmsLayerId],
  );

  const legacyTileUrl = useMemo(
    () => buildLegacyWmsTileUrl(effectiveLegacyWms, legacyClip, wmsBaseUrl, siWmsMapTimeExtent, cloudCoverage),
    [effectiveLegacyWms, legacyClip, wmsBaseUrl, siWmsMapTimeExtent, cloudCoverage],
  );

  return (
    <>
      {isMapLoaded &&
        sentinelVisible &&
        siMultiSentinelRasterRuns != null &&
        siMultiSentinelRasterRuns.filter(s => s.ready).map(spec => (
          <Source
            key={`si-sentinel-${spec.aoiId}-${spec.stackKey}-${spec.wmsLayerId}-${spec.timeStart}-${spec.timeEnd}-${spec.bounds?.join(',') ?? 'nb'}-${spec.clip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(spec.clip.evalscriptB64)}`}
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
                'raster-opacity':
                  (spec.clip.evalscriptB64 ? 1 : 0.85) * (spec.bounds ? drawVisualOpacity : 1) * symOpacityForWmsLayerId(spec.wmsLayerId),
                'raster-fade-duration': 0,
              }}
            />
          </Source>
        ))}

      {isMapLoaded && sentinelVisible && siMultiSentinelRasterRuns === null && drawnAoiWmsClipReady && (
        <Source
          key={`sentinel-${effectiveLegacyWms}-${wmsDate}-${wmsRasterAoiBoundsLngLat?.join(',') ?? 'world'}-${legacyClip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(legacyClip.evalscriptB64)}`}
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
              'raster-opacity':
                (legacyClip.evalscriptB64 ? 1 : 0.85) *
                (drawnGeometry != null && wmsRasterAoiBoundsLngLat ? drawVisualOpacity : 1) *
                symOpacityForWmsLayerId(effectiveLegacyWms || ''),
              'raster-fade-duration': 0,
            }}
          />
        </Source>
      )}
    </>
  );
}
