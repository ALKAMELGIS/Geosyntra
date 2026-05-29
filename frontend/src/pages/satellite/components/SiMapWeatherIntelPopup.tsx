import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import {
  fetchOpenMeteoMapWeather,
  openMeteoForwardGeocode,
  type OpenMeteoMapWeatherBundle,
} from '../../../lib/openMeteoMapWeather';
import type { SiMapWeatherPanelTheme } from '../utils/siMapWeatherTypes';
import { SiMapWeatherTimeHistoryPanel } from './SiMapWeatherTimeHistoryPanel';
import './SiMapWeatherIntelPopup.css';
import './SiMapWeatherTimeHistoryPanel.css';

export type SiMapWeatherIntelSource = 'click' | 'search' | 'feature';

export type SiMapWeatherIntelPin = {
  lng: number;
  lat: number;
  name?: string;
  source: SiMapWeatherIntelSource;
};

type SiMapWeatherIntelPopupProps = {
  pin: SiMapWeatherIntelPin | null;
  theme: SiMapWeatherPanelTheme;
  onClose: () => void;
  onPinChange?: (pin: SiMapWeatherIntelPin) => void;
  /** External search query from map search bar */
  externalSearchQuery?: string;
  onExternalSearchConsumed?: () => void;
  openWeatherApiKey?: string;
  /** When set, chart module can snap weather to AOI centroid. */
  aoiCentroid?: { lng: number; lat: number } | null;
  aoiLabel?: string | null;
};

function formatTemp(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${Math.round(c)}°C`;
}

function formatDay(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function SiMapWeatherIntelPopup({
  pin,
  theme,
  onClose,
  onPinChange,
  externalSearchQuery,
  onExternalSearchConsumed,
  openWeatherApiKey = '',
  aoiCentroid = null,
  aoiLabel = null,
}: SiMapWeatherIntelPopupProps) {
  const [bundle, setBundle] = useState<OpenMeteoMapWeatherBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pinKey = pin ? `${pin.lng.toFixed(5)}:${pin.lat.toFixed(5)}` : '';

  const loadWeather = useCallback(async (target: SiMapWeatherIntelPin) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpenMeteoMapWeather(target.lat, target.lng, target.name);
      if (ac.signal.aborted) return;
      setBundle(data);
    } catch (e) {
      if (ac.signal.aborted) return;
      setBundle(null);
      setError(e instanceof Error ? e.message : 'Weather fetch failed');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pin) {
      setBundle(null);
      setError(null);
      setLoading(false);
      return;
    }
    void loadWeather(pin);
    return () => abortRef.current?.abort();
  }, [pinKey, pin?.name, loadWeather, pin]);

  const runSearch = useCallback(async () => {
    const q = searchDraft.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    const geo = await openMeteoForwardGeocode(q);
    if (!geo) {
      setError('Location not found. Try a place name or lat,lng.');
      setLoading(false);
      return;
    }
    const next: SiMapWeatherIntelPin = {
      lng: geo.lng,
      lat: geo.lat,
      name: geo.name,
      source: 'search',
    };
    onPinChange?.(next);
    await loadWeather(next);
  }, [searchDraft, loadWeather, onPinChange]);

  useEffect(() => {
    const q = externalSearchQuery?.trim();
    if (!q) return;
    setSearchDraft(q);
    void (async () => {
      const geo = await openMeteoForwardGeocode(q);
      onExternalSearchConsumed?.();
      if (!geo) return;
      const next: SiMapWeatherIntelPin = {
        lng: geo.lng,
        lat: geo.lat,
        name: geo.name,
        source: 'search',
      };
      onPinChange?.(next);
      await loadWeather(next);
    })();
  }, [externalSearchQuery, onExternalSearchConsumed, onPinChange, loadWeather]);

  const useAoiCenter = useCallback(() => {
    if (!aoiCentroid) return;
    const next: SiMapWeatherIntelPin = {
      lng: aoiCentroid.lng,
      lat: aoiCentroid.lat,
      name: aoiLabel ?? 'AOI center',
      source: 'feature',
    };
    onPinChange?.(next);
    void loadWeather(next);
  }, [aoiCentroid, aoiLabel, onPinChange, loadWeather]);

  if (!pin) return null;

  const cur = bundle?.current;
  const themeClass = theme === 'light' ? 'si-map-wx-intel--light' : 'si-map-wx-intel--dark';

  return (
    <Marker longitude={pin.lng} latitude={pin.lat} anchor="bottom" offset={[0, -12] as [number, number]}>
      <div
        className={`si-map-wx-intel ${themeClass}${historyOpen ? ' si-map-wx-intel--history-open' : ''}`}
        role="dialog"
        aria-label="Weather at location"
        onClick={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <header className="si-map-wx-intel__head">
          <div className="si-map-wx-intel__head-text">
            <span className="si-map-wx-intel__eyebrow">Open-Meteo</span>
            <h3 className="si-map-wx-intel__title">{bundle?.placeName ?? pin.name ?? 'Selected point'}</h3>
            <p className="si-map-wx-intel__coords">
              {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
              {pin.source === 'feature' ? ' · Data layer' : pin.source === 'search' ? ' · Search' : ' · Map click'}
            </p>
          </div>
          <div className="si-map-wx-intel__head-actions">
            <button
              type="button"
              className={`si-map-wx-intel__icon-btn si-map-wx-intel__icon-btn--chart${historyOpen ? ' is-active' : ''}`}
              title="Weather time history"
              aria-label="Weather time history chart"
              aria-pressed={historyOpen}
              onClick={() => setHistoryOpen(v => !v)}
            >
              <i className="fa-solid fa-chart-line" aria-hidden />
            </button>
            <button
              type="button"
              className="si-map-wx-intel__icon-btn"
              title="Refresh weather"
              aria-label="Refresh weather"
              disabled={loading}
              onClick={() => void loadWeather(pin)}
            >
              <i className={`fa-solid fa-rotate-right${loading ? ' fa-spin' : ''}`} aria-hidden />
            </button>
            <button type="button" className="si-map-wx-intel__icon-btn" aria-label="Close" onClick={onClose}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </header>

        <form
          className="si-map-wx-intel__search"
          onSubmit={e => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            value={searchDraft}
            onChange={e => setSearchDraft(e.target.value)}
            placeholder="Search place or lat,lng"
            aria-label="Search location for weather"
          />
          <button type="submit" disabled={loading || !searchDraft.trim()}>
            Go
          </button>
        </form>

        {error ? <p className="si-map-wx-intel__error">{error}</p> : null}

        {loading && !bundle ? (
          <p className="si-map-wx-intel__loading">Loading weather…</p>
        ) : cur ? (
          <>
            <div className="si-map-wx-intel__current">
              <div className="si-map-wx-intel__current-main">
                <i className={`fa-solid ${cur.icon} si-map-wx-intel__wx-icon`} aria-hidden />
                <span className="si-map-wx-intel__temp">{formatTemp(cur.tempC)}</span>
              </div>
              <p className="si-map-wx-intel__condition">{cur.label}</p>
              <ul className="si-map-wx-intel__stats">
                <li>
                  <span>Wind</span>
                  <strong>
                    {cur.windKmh != null ? `${cur.windKmh.toFixed(0)} km/h` : '—'}{' '}
                    {cur.windDirLabel}
                    {cur.windDirDeg != null ? ` (${Math.round(cur.windDirDeg)}°)` : ''}
                  </strong>
                </li>
                <li>
                  <span>Humidity</span>
                  <strong>{cur.humidityPct != null ? `${Math.round(cur.humidityPct)}%` : '—'}</strong>
                </li>
                <li>
                  <span>Precip.</span>
                  <strong>{cur.precipMm != null ? `${cur.precipMm.toFixed(1)} mm` : '—'}</strong>
                </li>
              </ul>
            </div>

            {bundle.hourly.length > 0 ? (
              <section className="si-map-wx-intel__section">
                <h4>Next hours</h4>
                <div className="si-map-wx-intel__hourly">
                  {bundle.hourly.slice(0, 8).map(h => (
                    <div key={h.time} className="si-map-wx-intel__hour">
                      <time>{h.time.slice(11, 16)}</time>
                      <i className={`fa-solid ${h.icon}`} aria-hidden />
                      <span>{formatTemp(h.tempC)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {bundle.daily.length > 0 ? (
              <section className="si-map-wx-intel__section">
                <h4>7-day forecast</h4>
                <ul className="si-map-wx-intel__daily">
                  {bundle.daily.map(d => (
                    <li key={d.date}>
                      <span className="si-map-wx-intel__day">{formatDay(d.date)}</span>
                      <i className={`fa-solid ${d.icon}`} aria-hidden />
                      <span className="si-map-wx-intel__day-temps">
                        {formatTemp(d.tempMaxC)}
                        <span className="si-map-wx-intel__day-lo">{formatTemp(d.tempMinC)}</span>
                      </span>
                      <span className="si-map-wx-intel__day-rain">
                        {d.precipMm != null && d.precipMm > 0.05 ? `${d.precipMm.toFixed(0)} mm` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {historyOpen ? (
          <SiMapWeatherTimeHistoryPanel
            pin={{ lat: pin.lat, lng: pin.lng, name: bundle?.placeName ?? pin.name }}
            theme={theme}
            openWeatherApiKey={openWeatherApiKey}
            onClose={() => setHistoryOpen(false)}
            onRefreshLocation={() => void loadWeather(pin)}
            aoiLabel={aoiLabel}
            onUseAoiCenter={aoiCentroid ? useAoiCenter : undefined}
          />
        ) : null}

        <footer className="si-map-wx-intel__foot">
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">
            Data by Open-Meteo
          </a>
        </footer>
      </div>
    </Marker>
  );
}
