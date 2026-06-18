import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  downloadWxHistoryExcel,
  fetchWeatherTimeHistory,
  WX_HISTORY_VARIABLES,
  wxHistoryChartLabels,
  wxHistoryAddDaysIso,
  wxHistoryDatesMatchPreset,
  wxHistoryIsoDate,
  wxHistoryOpenMeteoLatestEndDate,
  wxHistoryPresetDateRange,
  wxHistoryStats,
  wxHistoryValidateDateRange,
  wxHistoryValueForVariable,
  type WxHistoryRange,
  type WxHistorySeries,
  type WxHistoryVariableId,
} from '../../../lib/openWeatherTimeHistory';
import { formatLocaleMediumDate, formatLocaleShortDate } from '../../../lib/localeDateFormat';
import type { SiMapWeatherPanelTheme } from '../utils/siMapWeatherTypes';
import { SiWeatherColoredIconFromHistoryVariable } from './SiWeatherColoredIcon';
import './SiMapWeatherTimeHistoryPanel.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Legend,
  Filler,
);

export type SiMapWeatherTimeHistoryPin = {
  lat: number;
  lng: number;
  name?: string;
};

export type SiMapWeatherTimeHistoryPanelProps = {
  pin: SiMapWeatherTimeHistoryPin;
  theme: SiMapWeatherPanelTheme;
  openWeatherApiKey: string;
  onClose: () => void;
  onRefreshLocation?: () => void;
  aoiLabel?: string | null;
  onUseAoiCenter?: () => void;
};

export function SiMapWeatherTimeHistoryPanel({
  pin,
  theme,
  openWeatherApiKey: _openWeatherApiKey,
  onClose,
  onRefreshLocation,
  aoiLabel,
  onUseAoiCenter,
}: SiMapWeatherTimeHistoryPanelProps) {
  const [series, setSeries] = useState<WxHistorySeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variable, setVariable] = useState<WxHistoryVariableId>('temperature');
  const [activePreset, setActivePreset] = useState<WxHistoryRange | null>('7d');
  const preset7 = wxHistoryPresetDateRange('7d');
  const [startDate, setStartDate] = useState(preset7.startDate);
  const [endDate, setEndDate] = useState(preset7.endDate);
  const maxEndDate = wxHistoryOpenMeteoLatestEndDate();
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pinKey = `${pin.lat.toFixed(5)}:${pin.lng.toFixed(5)}`;
  const providerLabel = 'Open-Meteo (historical)';

  const load = useCallback(
    async (force = false) => {
      const rangeError = wxHistoryValidateDateRange(startDate, endDate);
      if (rangeError) {
        setError(rangeError);
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      try {
        const presetRange =
          activePreset && wxHistoryDatesMatchPreset(startDate, endDate, activePreset)
            ? activePreset
            : '7d';
        const data = await fetchWeatherTimeHistory(pin.lat, pin.lng, {
          range: presetRange,
          startDate,
          endDate,
          placeName: pin.name,
          force,
        });
        if (ac.signal.aborted) return;
        setSeries(data);
      } catch (e) {
        if (ac.signal.aborted) return;
        setSeries(null);
        setError(e instanceof Error ? e.message : 'Failed to load time history');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [pin.lat, pin.lng, pin.name, activePreset, startDate, endDate],
  );

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [pinKey, startDate, endDate, load]);

  const selectRange = (id: WxHistoryRange) => {
    const preset = wxHistoryPresetDateRange(id);
    setActivePreset(id);
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
  };

  const syncPresetFromDates = (start: string, end: string) => {
    const match = (['7d', '14d', '30d'] as const).find(r => wxHistoryDatesMatchPreset(start, end, r));
    setActivePreset(match ?? null);
  };

  const applyStartDate = (v: string) => {
    if (!v) return;
    const nextEnd = v > endDate ? v : endDate;
    setStartDate(v);
    if (v > endDate) setEndDate(v);
    syncPresetFromDates(v, nextEnd);
  };

  const applyEndDate = (v: string) => {
    if (!v) return;
    const nextStart = v < startDate ? v : startDate;
    setEndDate(v);
    if (v < startDate) setStartDate(v);
    syncPresetFromDates(nextStart, v);
  };

  const varMeta = WX_HISTORY_VARIABLES.find(v => v.id === variable)!;
  const chartModel = useMemo(() => {
    const points = series?.points ?? [];
    const values = points
      .map(p => wxHistoryValueForVariable(p, variable))
      .filter((v): v is number => v != null && Number.isFinite(v));
    const labels = wxHistoryChartLabels(points);
    const data = points.map(p => wxHistoryValueForVariable(p, variable));
    const stats = wxHistoryStats(values);
    const isLight = theme === 'light';
    return {
      labels,
      data,
      stats,
      chartData: {
        labels,
        datasets: [
          {
            label: `${varMeta.label} (${varMeta.unit})`,
            data,
            borderColor: varMeta.color,
            backgroundColor: `${varMeta.color}33`,
            borderWidth: 2,
            pointRadius: points.length > 80 ? 0 : 2,
            pointHoverRadius: 4,
            tension: 0.28,
            fill: true,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isLight ? 'rgba(255,255,255,0.96)' : 'rgba(15,23,42,0.94)',
            titleColor: isLight ? '#0f172a' : '#f8fafc',
            bodyColor: isLight ? '#334155' : '#e2e8f0',
            borderColor: isLight ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.25)',
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 8,
              color: isLight ? '#64748b' : '#94a3b8',
              font: { size: 10 },
            },
            grid: { color: isLight ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.12)' },
          },
          y: {
            ticks: {
              color: isLight ? '#64748b' : '#94a3b8',
              font: { size: 10 },
            },
            grid: { color: isLight ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.12)' },
            title: {
              display: true,
              text: varMeta.unit,
              color: isLight ? '#475569' : '#cbd5e1',
              font: { size: 10 },
            },
          },
        },
      } satisfies ChartOptions<'line'>,
    };
  }, [series, variable, varMeta, theme]);

  const metaLine = [
    pin.name ?? `${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`,
    providerLabel,
    series?.timezone,
  ]
    .filter(Boolean)
    .join(' · ');

  const varShortLabel: Record<WxHistoryVariableId, string> = {
    temperature: 'Temp',
    precipitation: 'Rain',
    humidity: 'Humid',
    wind: 'Wind',
    pressure: 'Press',
    clouds: 'Cloud',
  };

  return (
    <section
      className={`si-map-wx-history${theme === 'light' ? ' si-map-wx-history--light' : ''}`}
      aria-label="Weather time history"
    >
      <header className="si-map-wx-history__head">
        <div className="si-map-wx-history__head-text">
          <h4 className="si-map-wx-history__title">Time history</h4>
          <p className="si-map-wx-history__sub" title={metaLine}>
            {metaLine}
          </p>
        </div>
        <div className="si-map-wx-history__head-actions">
          <button
            type="button"
            className="si-map-wx-history__icon-btn"
            title="Refresh series"
            aria-label="Refresh"
            disabled={loading}
            onClick={() => void load(true)}
          >
            <i className={`fa-solid fa-rotate-right${loading ? ' fa-spin' : ''}`} aria-hidden />
          </button>
          <button type="button" className="si-map-wx-history__icon-btn" aria-label="Close chart" onClick={onClose}>
            <i className="fa-solid fa-chevron-up" aria-hidden />
          </button>
        </div>
      </header>

      <div className="si-map-wx-history__controls">
        <div className="si-map-wx-history__controls-top">
          <div className="si-map-wx-history__ranges" role="group" aria-label="Time range">
            {(
              [
                { id: '7d' as const, label: '7d' },
                { id: '14d' as const, label: '14d' },
                { id: '30d' as const, label: '30d' },
              ] as const
            ).map(r => (
              <button
                key={r.id}
                type="button"
                className={`si-map-wx-history__chip${activePreset === r.id ? ' is-active' : ''}`}
                title={`${r.label === '7d' ? '7' : r.label === '14d' ? '14' : '30'} days`}
                onClick={() => selectRange(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="si-map-wx-history__loc-actions">
            {onUseAoiCenter && aoiLabel ? (
              <button
                type="button"
                className="si-map-wx-history__icon-chip"
                onClick={onUseAoiCenter}
                title={aoiLabel}
                aria-label="Use AOI center"
              >
                <i className="fa-solid fa-draw-polygon" aria-hidden />
              </button>
            ) : null}
            {onRefreshLocation ? (
              <button
                type="button"
                className="si-map-wx-history__icon-chip"
                onClick={onRefreshLocation}
                title="Refresh map point"
                aria-label="Map point"
              >
                <i className="fa-solid fa-location-crosshairs" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        <div className="si-map-wx-history__vars-scroll" role="group" aria-label="Environmental variable">
          <div className="si-map-wx-history__vars">
            {WX_HISTORY_VARIABLES.map(v => (
              <button
                key={v.id}
                type="button"
                className={`si-map-wx-history__var${variable === v.id ? ' is-active' : ''}`}
                style={{ '--wx-var-color': v.color } as CSSProperties}
                title={v.label}
                aria-label={v.label}
                onClick={() => setVariable(v.id)}
              >
                <SiWeatherColoredIconFromHistoryVariable variable={v.id} size="sm" />
                {varShortLabel[v.id]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="si-map-wx-history__error">{error}</p> : null}

      <div className={`si-map-wx-history__chart-wrap${loading ? ' is-loading' : ''}`}>
        {chartModel.stats ? (
          <ul className="si-map-wx-history__stats-overlay" aria-label="Series statistics">
            <li>
              <span>Min</span>
              <strong>
                {chartModel.stats.min.toFixed(1)}
                {varMeta.unit}
              </strong>
            </li>
            <li>
              <span>Avg</span>
              <strong>
                {chartModel.stats.mean.toFixed(1)}
                {varMeta.unit}
              </strong>
            </li>
            <li>
              <span>Max</span>
              <strong>
                {chartModel.stats.max.toFixed(1)}
                {varMeta.unit}
              </strong>
            </li>
            <li>
              <span>n</span>
              <strong>{series?.points.length ?? 0}</strong>
            </li>
          </ul>
        ) : null}
        {loading && !series ? (
          <p className="si-map-wx-history__loading">Loading time series…</p>
        ) : series && series.points.length > 1 ? (
          <>
            <Line data={chartModel.chartData} options={chartModel.options} />
            {loading ? <p className="si-map-wx-history__chart-busy">Updating chart…</p> : null}
          </>
        ) : (
          <p className="si-map-wx-history__loading">No time-series data for this location.</p>
        )}
      </div>

      <footer className="si-map-wx-history__foot">
        <div className="si-map-wx-history__foot-actions" role="group" aria-label="Date range and export">
          <label
            className={`si-map-wx-history__foot-date${activePreset == null ? ' is-custom' : ''}`}
            title={`Start date: ${formatLocaleMediumDate(startDate)}`}
          >
            <i className="fa-regular fa-calendar" aria-hidden />
            <span className="si-map-wx-history__foot-btn-label">{formatLocaleShortDate(startDate)}</span>
            <input
              ref={startInputRef}
              type="date"
              className="si-map-wx-history__foot-date-input"
              value={startDate}
              min="1970-01-01"
              max={endDate}
              aria-label={`Start date, ${formatLocaleMediumDate(startDate)}`}
              tabIndex={-1}
              onChange={e => applyStartDate(e.target.value)}
              onPointerDown={e => e.stopPropagation()}
            />
          </label>

          <label
            className={`si-map-wx-history__foot-date${activePreset == null ? ' is-custom' : ''}`}
            title={`End date: ${formatLocaleMediumDate(endDate)}`}
          >
            <i className="fa-regular fa-calendar-check" aria-hidden />
            <span className="si-map-wx-history__foot-btn-label">{formatLocaleShortDate(endDate)}</span>
            <input
              ref={endInputRef}
              type="date"
              className="si-map-wx-history__foot-date-input"
              value={endDate}
              min={startDate}
              max={maxEndDate}
              aria-label={`End date, ${formatLocaleMediumDate(endDate)}`}
              tabIndex={-1}
              onChange={e => applyEndDate(e.target.value)}
              onPointerDown={e => e.stopPropagation()}
            />
          </label>

          <button
            type="button"
            className="si-map-wx-history__foot-btn si-map-wx-history__foot-btn--excel"
            title="Export time history to Excel"
            aria-label="Export to Excel"
            disabled={!series?.points.length || loading}
            onClick={() => series && downloadWxHistoryExcel(series)}
          >
            <i className="fa-regular fa-file-excel" aria-hidden />
          </button>
        </div>
      </footer>
    </section>
  );
}
