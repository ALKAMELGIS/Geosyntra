import { Source, Layer, Marker } from 'react-map-gl/mapbox';
import { useMemo } from 'react';
import type { SiMapSunSkySettings } from '../utils/siMapSunSkyTypes';
import {
  buildSolarPathCoords,
  buildSiMapSunSkySnapshot,
  computeSolsticeComparison,
  sunGroundPositionFromAzimuth,
  yearFromIsoDate,
} from '../utils/siMapSunSkyAnalysis';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import './SiMapSunSkyMapOverlay.css';

export type SiMapSunSkyMapOverlayProps = {
  active: boolean;
  settings: SiMapSunSkySettings;
  weather: SiMapWeatherSettings;
  mapCenter: { lng: number; lat: number };
  losSketchMode?: 'observer' | 'target' | null;
};

export function SiMapSunSkyMapOverlay({
  active,
  settings,
  weather,
  mapCenter,
}: SiMapSunSkyMapOverlayProps) {
  const snapshot = useMemo(
    () =>
      buildSiMapSunSkySnapshot(
        weather.daylightMinutes,
        weather.daylightDate,
        mapCenter.lat,
        mapCenter.lng,
      ),
    [weather.daylightMinutes, weather.daylightDate, mapCenter.lat, mapCenter.lng],
  );

  /** Ground marker is misleading in 3D — sky atmosphere + directional light show the real sun. */
  const useSkyAtmosphereSun = weather.sunPositionByDateTime;
  const sunMarker = useMemo(
    () =>
      sunGroundPositionFromAzimuth(
        mapCenter.lng,
        mapCenter.lat,
        snapshot.sun.azimuth,
        Math.max(8, 18 + snapshot.sun.elevationDeg * 0.25),
      ),
    [mapCenter, snapshot.sun.azimuth, snapshot.sun.elevationDeg],
  );

  const solarPath = useMemo(
    () =>
      settings.showSolarPath
        ? buildSolarPathCoords(
            weather.daylightDate,
            mapCenter.lat,
            mapCenter.lng,
            mapCenter.lat,
          )
        : [],
    [settings.showSolarPath, weather.daylightDate, mapCenter.lat, mapCenter.lng],
  );

  const solstice = useMemo(() => {
    if (settings.seasonalMode === 'off') return null;
    return computeSolsticeComparison(
      weather.daylightMinutes,
      yearFromIsoDate(weather.daylightDate),
      mapCenter.lat,
    );
  }, [settings.seasonalMode, weather.daylightMinutes, weather.daylightDate, mapCenter.lat]);

  const summerSunPt =
    solstice && (settings.seasonalMode === 'summer' || settings.seasonalMode === 'compare')
      ? sunGroundPositionFromAzimuth(
          mapCenter.lng,
          mapCenter.lat,
          solstice.summer.azimuth,
          14,
        )
      : null;
  const winterSunPt =
    solstice && (settings.seasonalMode === 'winter' || settings.seasonalMode === 'compare')
      ? sunGroundPositionFromAzimuth(
          mapCenter.lng,
          mapCenter.lat,
          solstice.winter.azimuth,
          14,
        )
      : null;

  const losLine =
    settings.losObserver && settings.losTarget
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [settings.losObserver.lng, settings.losObserver.lat],
              [settings.losTarget.lng, settings.losTarget.lat],
            ],
          },
        }
      : null;

  if (!active) return null;

  return (
    <>
      {settings.showSunPosition && snapshot.isDaylight ? (
        <>
          {!useSkyAtmosphereSun ? (
            <Source
              id="si-sun-sky-azimuth"
              type="geojson"
              data={{
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [mapCenter.lng, mapCenter.lat],
                    [sunMarker.lng, sunMarker.lat],
                  ],
                },
              }}
            >
              <Layer
                id="si-sun-sky-azimuth-line"
                type="line"
                paint={{
                  'line-color': '#fbbf24',
                  'line-width': 2.5,
                  'line-opacity': 0.85,
                  'line-dasharray': [2, 1.5],
                }}
              />
            </Source>
          ) : null}
          {!useSkyAtmosphereSun ? (
            <Marker longitude={sunMarker.lng} latitude={sunMarker.lat} anchor="center">
              <div className="si-sun-sky-map__sun" title={`Sun · ${snapshot.elevationLabel}`}>
                <i className="fa-solid fa-sun" aria-hidden />
              </div>
            </Marker>
          ) : null}
        </>
      ) : null}

      {solarPath.length >= 2 ? (
        <Source
          id="si-sun-sky-path"
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: solarPath },
          }}
        >
          <Layer
            id="si-sun-sky-path-line"
            type="line"
            paint={{
              'line-color': '#fde68a',
              'line-width': 2,
              'line-opacity': 0.55,
            }}
          />
        </Source>
      ) : null}

      {summerSunPt ? (
        <Source
          id="si-sun-sky-summer"
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [mapCenter.lng, mapCenter.lat],
                [summerSunPt.lng, summerSunPt.lat],
              ],
            },
          }}
        >
          <Layer
            id="si-sun-sky-summer-line"
            type="line"
            paint={{ 'line-color': '#f97316', 'line-width': 2, 'line-opacity': 0.7 }}
          />
        </Source>
      ) : null}

      {winterSunPt ? (
        <Source
          id="si-sun-sky-winter"
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [mapCenter.lng, mapCenter.lat],
                [winterSunPt.lng, winterSunPt.lat],
              ],
            },
          }}
        >
          <Layer
            id="si-sun-sky-winter-line"
            type="line"
            paint={{ 'line-color': '#38bdf8', 'line-width': 2, 'line-opacity': 0.7 }}
          />
        </Source>
      ) : null}

      {losLine ? (
        <Source id="si-sun-sky-los" type="geojson" data={{ type: 'FeatureCollection', features: [losLine] }}>
          <Layer
            id="si-sun-sky-los-line"
            type="line"
            paint={{ 'line-color': '#a78bfa', 'line-width': 3, 'line-opacity': 0.9 }}
          />
        </Source>
      ) : null}

      {settings.losObserver ? (
        <Marker
          longitude={settings.losObserver.lng}
          latitude={settings.losObserver.lat}
          anchor="center"
        >
          <div className="si-sun-sky-map__los si-sun-sky-map__los--observer" title="Observer">
            O
          </div>
        </Marker>
      ) : null}

      {settings.losTarget ? (
        <Marker longitude={settings.losTarget.lng} latitude={settings.losTarget.lat} anchor="center">
          <div className="si-sun-sky-map__los si-sun-sky-map__los--target" title="Target">
            T
          </div>
        </Marker>
      ) : null}
    </>
  );
}
