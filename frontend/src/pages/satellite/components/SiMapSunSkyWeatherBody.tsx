import { useCallback, useEffect, useMemo } from 'react';
import { SiMapDaylightPanel } from './SiMapDaylightPanel';
import './SiMapDaylightArcSlider.css';
import type { SiMapWeatherSettings } from '../utils/siMapWeatherTypes';
import { isSiMapWeatherPresetActive } from '../utils/siMapWeatherActive';
import {
  analyzeSunLineOfSight,
  assessRooftopSolarPotential,
  buildSiMapSunSkySnapshot,
  computeSolsticeComparison,
  yearFromIsoDate,
} from '../utils/siMapSunSkyAnalysis';
import type { SiMapSunSkyAnalysisTab, SiMapSunSkySettings } from '../utils/siMapSunSkyTypes';

const TABS: { id: SiMapSunSkyAnalysisTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'fa-compass' },
  { id: 'sky', label: 'Sky & Time', icon: 'fa-cloud-sun' },
  { id: 'shadows', label: 'Shadows', icon: 'fa-mountain-sun' },
  { id: 'analysis', label: 'Analysis', icon: 'fa-solar-panel' },
];

export type SiMapSunSkyWeatherBodyProps = {
  weather: SiMapWeatherSettings;
  onWeatherPatch: (
    partial:
      | Partial<SiMapWeatherSettings>
      | ((prev: SiMapWeatherSettings) => Partial<SiMapWeatherSettings> | SiMapWeatherSettings),
  ) => void;
  sunSkySettings: SiMapSunSkySettings;
  onSunSkySettingsChange: (next: SiMapSunSkySettings) => void;
  mapCenter: { lng: number; lat: number };
  isLightTheme?: boolean;
  losSketchMode: 'observer' | 'target' | null;
  onLosSketchModeChange: (mode: 'observer' | 'target' | null) => void;
  onClearLos: () => void;
};

export function SiMapSunSkyWeatherBody({
  weather,
  onWeatherPatch,
  sunSkySettings,
  onSunSkySettingsChange,
  mapCenter,
  isLightTheme = false,
  losSketchMode,
  onLosSketchModeChange,
  onClearLos,
}: SiMapSunSkyWeatherBodyProps) {
  const patch = useCallback(
    (partial: Partial<SiMapSunSkySettings>) =>
      onSunSkySettingsChange({ ...sunSkySettings, ...partial }),
    [onSunSkySettingsChange, sunSkySettings],
  );

  useEffect(() => {
    if (!isSiMapWeatherPresetActive(weather, 'sunSky')) return;
    onWeatherPatch(prev => ({
      ...prev,
      sunPositionByDateTime: true,
      daylightShadows: sunSkySettings.buildingShadows,
    }));
  }, [onWeatherPatch, sunSkySettings.buildingShadows, weather.activePresets]);

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

  const solstice = useMemo(
    () =>
      computeSolsticeComparison(
        weather.daylightMinutes,
        yearFromIsoDate(weather.daylightDate),
        mapCenter.lat,
      ),
    [weather.daylightMinutes, weather.daylightDate, mapCenter.lat],
  );

  const rooftop = useMemo(
    () =>
      assessRooftopSolarPotential(
        snapshot,
        sunSkySettings.rooftopAreaM2,
        sunSkySettings.panelDensityWm2,
      ),
    [snapshot, sunSkySettings.rooftopAreaM2, sunSkySettings.panelDensityWm2],
  );

  const losResult = useMemo(() => {
    if (!sunSkySettings.losObserver || !sunSkySettings.losTarget) return null;
    return analyzeSunLineOfSight(
      sunSkySettings.losObserver,
      sunSkySettings.losTarget,
      snapshot.sun,
    );
  }, [sunSkySettings.losObserver, sunSkySettings.losTarget, snapshot.sun]);

  const primaryEvents = snapshot.events.filter(e =>
    [
      'sunrise',
      'solarNoon',
      'sunset',
      'goldenHourMorningStart',
      'goldenHourEveningStart',
      'blueHourMorningStart',
      'blueHourEveningStart',
    ].includes(e.kind),
  );

  return (
    <>
      <nav className="si-weather-panel__modules" role="tablist" aria-label="Sun and sky views">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={sunSkySettings.activeTab === tab.id}
            className={
              'si-weather-panel__module' +
              (sunSkySettings.activeTab === tab.id ? ' is-active' : '')
            }
            onClick={() => patch({ activeTab: tab.id })}
          >
            <i className={`fa-solid ${tab.icon} si-weather-panel__module-glyph`} aria-hidden />
            <span className="si-weather-panel__module-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {sunSkySettings.activeTab === 'overview' ? (
        <>
          <div className="si-weather-panel__stat-grid">
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Azimuth</span>
              <strong>{snapshot.azimuthLabel}</strong>
            </div>
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Elevation</span>
              <strong>{snapshot.elevationLabel}</strong>
            </div>
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Clear-sky GHI</span>
              <strong>{Math.round(snapshot.clearSkyGhiWm2)} W/m²</strong>
            </div>
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Exposure</span>
              <strong>
                {snapshot.exposureScore}% · {snapshot.exposureLabel}
              </strong>
            </div>
          </div>

          <p className="si-weather-panel__section-label">Solar events</p>
          <ul className="si-weather-panel__event-list">
            {primaryEvents.map(ev => (
              <li key={ev.kind}>
                <span>{ev.label}</span>
                <button
                  type="button"
                  className="si-weather-panel__link-btn"
                  disabled={ev.minutes == null}
                  onClick={() =>
                    ev.minutes != null && onWeatherPatch({ daylightMinutes: ev.minutes })
                  }
                  title="Jump to this time"
                >
                  {ev.timeLabel}
                </button>
              </li>
            ))}
          </ul>

          <p className="si-weather-panel__section-label">Irradiance</p>
          <div className="si-weather-panel__irr-row">
            <span>DNI {Math.round(snapshot.directNormalIrradianceWm2)} W/m²</span>
            <span>DHI {Math.round(snapshot.diffuseHorizontalWm2)} W/m²</span>
          </div>
        </>
      ) : null}

      {sunSkySettings.activeTab === 'sky' ? (
        <SiMapDaylightPanel
          settings={weather}
          onPatch={onWeatherPatch}
          isLightTheme={isLightTheme}
        />
      ) : null}

      {sunSkySettings.activeTab === 'shadows' ? (
        <>
          <label className="si-weather-panel__check">
            <input
              type="checkbox"
              checked={sunSkySettings.terrainShadows}
              onChange={e => patch({ terrainShadows: e.target.checked })}
            />
            <span>Terrain shadow analysis (DEM hillshade)</span>
          </label>
          <label className="si-weather-panel__check">
            <input
              type="checkbox"
              checked={sunSkySettings.buildingShadows}
              onChange={e => {
                patch({ buildingShadows: e.target.checked });
                onWeatherPatch({ daylightShadows: e.target.checked });
              }}
            />
            <span>Building shadow analysis (3D extrusions)</span>
          </label>
          <label className="si-weather-panel__check">
            <input
              type="checkbox"
              checked={sunSkySettings.showSunPosition}
              onChange={e => patch({ showSunPosition: e.target.checked })}
            />
            <span>Sun position visualization</span>
          </label>
          <label className="si-weather-panel__check">
            <input
              type="checkbox"
              checked={sunSkySettings.showSolarPath}
              onChange={e => patch({ showSolarPath: e.target.checked })}
            />
            <span>Solar path arc</span>
          </label>

          <p className="si-weather-panel__section-label">Seasonal comparison</p>
          <div className="si-daylight-panel__presets" role="group" aria-label="Seasonal mode">
            {(
              [
                ['off', 'Off'],
                ['summer', 'Summer solstice'],
                ['winter', 'Winter solstice'],
                ['compare', 'Compare both'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={
                  'si-daylight-panel__preset' +
                  (sunSkySettings.seasonalMode === id ? ' si-daylight-panel__preset--active' : '')
                }
                onClick={() => patch({ seasonalMode: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {sunSkySettings.seasonalMode !== 'off' ? (
            <div className="si-weather-panel__solstice-row">
              <div>
                <span className="si-weather-panel__solstice-tag si-weather-panel__solstice-tag--summer">
                  Jun 21
                </span>
                {solstice.summer.elevationDeg.toFixed(1)}° · {Math.round(solstice.summerGhi)} W/m²
              </div>
              <div>
                <span className="si-weather-panel__solstice-tag si-weather-panel__solstice-tag--winter">
                  Dec 21
                </span>
                {solstice.winter.elevationDeg.toFixed(1)}° · {Math.round(solstice.winterGhi)} W/m²
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {sunSkySettings.activeTab === 'analysis' ? (
        <>
          <p className="si-weather-panel__section-label">Solar exposure</p>
          <div className="si-weather-panel__exposure-bar">
            <div
              className="si-weather-panel__exposure-fill"
              style={{ width: `${snapshot.exposureScore}%` }}
            />
          </div>
          <p className="si-weather-panel__hint">
            Score combines current sun elevation and day length at {mapCenter.lat.toFixed(4)}°N.
          </p>

          <p className="si-weather-panel__section-label">Rooftop solar potential</p>
          <label className="si-weather-panel__field">
            Roof area (m²)
            <input
              type="number"
              min={10}
              max={50000}
              value={sunSkySettings.rooftopAreaM2}
              onChange={e => patch({ rooftopAreaM2: Number(e.target.value) || 120 })}
            />
          </label>
          <label className="si-weather-panel__field">
            Panel density (W/m²)
            <input
              type="number"
              min={80}
              max={350}
              value={sunSkySettings.panelDensityWm2}
              onChange={e => patch({ panelDensityWm2: Number(e.target.value) || 180 })}
            />
          </label>
          <div className="si-weather-panel__stat-grid si-weather-panel__stat-grid--compact">
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Peak capacity</span>
              <strong>{rooftop.peakCapacityKw} kW</strong>
            </div>
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Est. annual yield</span>
              <strong>{rooftop.annualYieldKwh.toLocaleString()} kWh</strong>
            </div>
            <div className="si-weather-panel__stat">
              <span className="si-weather-panel__stat-label">Suitability</span>
              <strong className={`si-weather-panel__suit si-weather-panel__suit--${rooftop.suitability}`}>
                {rooftop.suitability}
              </strong>
            </div>
          </div>

          <p className="si-weather-panel__section-label">Line of sight (sun context)</p>
          <p className="si-weather-panel__hint">Click the map to place observer and target points.</p>
          <div className="si-weather-panel__chip-row">
            <button
              type="button"
              className={
                'si-weather-panel__chip' + (losSketchMode === 'observer' ? ' is-active' : '')
              }
              onClick={() =>
                onLosSketchModeChange(losSketchMode === 'observer' ? null : 'observer')
              }
            >
              Set observer
            </button>
            <button
              type="button"
              className={
                'si-weather-panel__chip' + (losSketchMode === 'target' ? ' is-active' : '')
              }
              onClick={() => onLosSketchModeChange(losSketchMode === 'target' ? null : 'target')}
            >
              Set target
            </button>
            <button type="button" className="si-weather-panel__chip" onClick={onClearLos}>
              Clear
            </button>
          </div>
          {losResult ? (
            <div className="si-weather-panel__los-result">
              <p>{losResult.message}</p>
              <ul>
                <li>Distance: {(losResult.distanceM / 1000).toFixed(2)} km</li>
                <li>Terrain clear: {losResult.terrainClear ? 'Yes' : 'No'}</li>
                <li>Target illuminated: {losResult.targetIlluminated ? 'Yes' : 'No'}</li>
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
