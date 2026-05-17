import { useMemo } from 'react';
import MapGL, { Layer, Source } from 'react-map-gl/mapbox';
import type { ViewState } from 'react-map-gl/mapbox';
import { siMapSwipeViewState } from '../utils/siMapSwipeViewState';
import { buildSentinelHubWmsAoiClip } from '../../../lib/sentinelHubWmsAoiClip';
import type { SiMapProjectionMode } from '../utils/siMapProjectionTerrain';
import type { SiSentinelHubRasterRunLite } from './SiSentinelHubRasterLayers';

type ComparePaneProps = {
  viewState: ViewState;
  clipPath: string;
  mapStyle: string;
  mapboxAccessToken: string;
  transformRequest?: (url: string, resourceType: string) => { url: string };
  projectionMode: SiMapProjectionMode;
  compareTileUrl: string | null;
  compareBounds: [number, number, number, number] | null;
  compareOpacity: number;
  multiRuns: SiSentinelHubRasterRunLite[] | null;
  evalscriptKeyPart: (b64: string | null | undefined) => string;
};

/**
 * Clipped secondary map showing compare-time Sentinel WMS only.
 * Sits above the main map; CSS clip-path defines the reveal region.
 */
export function SiMapSwipeComparePane({
  viewState,
  clipPath,
  mapStyle,
  mapboxAccessToken,
  transformRequest,
  projectionMode,
  compareTileUrl,
  compareBounds,
  compareOpacity,
  multiRuns,
  evalscriptKeyPart,
}: ComparePaneProps) {
  const readyMulti = useMemo(
    () => (multiRuns ?? []).filter(s => s.ready && s.tileUrl),
    [multiRuns],
  );

  if (!compareTileUrl && readyMulti.length === 0) return null;

  const swipeViewState = siMapSwipeViewState(viewState);

  return (
    <div
      className="si-map-swipe-compare-pane"
      style={{ clipPath, WebkitClipPath: clipPath } as React.CSSProperties}
      aria-hidden
    >
      <MapGL
        {...swipeViewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        mapboxAccessToken={mapboxAccessToken}
        transformRequest={transformRequest}
        interactive={false}
        attributionControl={false}
        logoPosition="bottom-left"
        projection={{ name: projectionMode === 'globe' ? 'globe' : 'mercator' }}
        renderWorldCopies={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        touchZoomRotate={false}
        scrollZoom={false}
        boxZoom={false}
        dragPan={false}
        doubleClickZoom={false}
        keyboard={false}
        maxPitch={projectionMode === 'globe' ? 78 : 0}
        fog={
          projectionMode === 'globe'
            ? { range: [0.5, 10], color: '#020617', 'horizon-blend': 0.12 }
            : undefined
        }
      >
        {readyMulti.length > 0
          ? readyMulti.map(spec => {
              const stackKey = `${spec.aoiId}-${spec.stackKey}-${spec.wmsLayerId}-${spec.bounds?.join(',') ?? 'nb'}-${spec.clip.geometryWkt3857 ? 'g1' : 'g0'}-${evalscriptKeyPart(spec.clip.evalscriptB64)}`;
              const sourceKey = `swipe-${stackKey}-${spec.timeStart}-${spec.timeEnd}`;
              const opacity =
                (spec.clip.evalscriptB64 ? 1 : 0.85) * (spec.bounds ? 1 : 1);
              return (
                <Source
                  key={sourceKey}
                  id={`si-swipe-src-${spec.aoiId}-${spec.stackKey}`}
                  type="raster"
                  tiles={[spec.tileUrl]}
                  tileSize={512}
                  bounds={spec.bounds ?? undefined}
                >
                  <Layer
                    id={`si-swipe-layer-${spec.aoiId}-${spec.stackKey}`}
                    type="raster"
                    paint={{
                      'raster-opacity': opacity,
                      'raster-fade-duration': 0,
                    }}
                  />
                </Source>
              );
            })
          : compareTileUrl ? (
              <Source
                id="si-swipe-compare-source"
                type="raster"
                tiles={[compareTileUrl]}
                tileSize={512}
                bounds={compareBounds ?? undefined}
              >
                <Layer
                  id="si-swipe-compare-layer"
                  type="raster"
                  paint={{
                    'raster-opacity': compareOpacity,
                    'raster-fade-duration': 0,
                  }}
                />
              </Source>
            ) : null}
      </MapGL>
    </div>
  );
}

/** Build compare tile URL for legacy single-AOI stack (mirrors SiSentinelHubRasterLayers). */
export function buildSiMapSwipeCompareTileUrl(
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
