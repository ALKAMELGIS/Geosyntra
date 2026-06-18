import type { OpenMeteoDaySnapshot, OpenMeteoTemporalComparison } from '../../../lib/openMeteoMapWeatherHistorical';
import { SiWeatherColoredIcon, SiWeatherColoredIconFromMetric } from './SiWeatherColoredIcon';

function formatTemp(c: number | null): string {
  if (c == null || !Number.isFinite(c)) return '—';
  return `${Math.round(c)}°C`;
}

function PeriodStatCard({ snap }: { snap: OpenMeteoDaySnapshot }) {
  return (
    <li className="si-map-wx-intel__stat-card si-map-wx-intel__stat-card--period">
      <SiWeatherColoredIcon icon={snap.icon} size="md" />
      <span className="si-map-wx-intel__stat-k" title={snap.title}>
        {snap.title}
      </span>
      <strong className="si-map-wx-intel__stat-temp">{formatTemp(snap.tempC)}</strong>
      <span className="si-map-wx-intel__stat-detail">{snap.label}</span>
      <ul className="si-map-wx-intel__stat-rows" aria-label={`${snap.title} details`}>
        <li className="si-map-wx-intel__stat-row">
          <span className="si-map-wx-intel__stat-k">
            <SiWeatherColoredIconFromMetric metric="wind" size="sm" className="si-map-wx-intel__stat-row-icon" />
            Wind
          </span>
          <strong>
            {snap.windKmh != null ? `${snap.windKmh.toFixed(0)} km/h` : '—'}
            {snap.windDirLabel && snap.windDirLabel !== '—' ? ` ${snap.windDirLabel}` : ''}
          </strong>
        </li>
        <li className="si-map-wx-intel__stat-row">
          <span className="si-map-wx-intel__stat-k">
            <SiWeatherColoredIconFromMetric metric="humidity" size="sm" className="si-map-wx-intel__stat-row-icon" />
            Humidity
          </span>
          <strong>{snap.humidityPct != null ? `${Math.round(snap.humidityPct)}%` : '—'}</strong>
        </li>
        <li className="si-map-wx-intel__stat-row">
          <span className="si-map-wx-intel__stat-k">
            <SiWeatherColoredIconFromMetric metric="precip" size="sm" className="si-map-wx-intel__stat-row-icon" />
            Precip.
          </span>
          <strong>{snap.precipMm != null ? `${snap.precipMm.toFixed(1)} mm` : '—'}</strong>
        </li>
      </ul>
    </li>
  );
}

export type SiMapWeatherTemporalComparisonProps = {
  comparison: OpenMeteoTemporalComparison | null;
  comparisonLoading: boolean;
};

export function SiMapWeatherTemporalComparison({
  comparison,
  comparisonLoading,
}: SiMapWeatherTemporalComparisonProps) {
  return (
    <section className="si-map-wx-intel__compare-block" aria-label="Temporal comparison">
      <h4>Temporal comparison</h4>
      {comparisonLoading && !comparison ? (
        <p className="si-map-wx-intel__loading">Loading comparison…</p>
      ) : comparison ? (
        <ul className="si-map-wx-intel__stat-grid si-map-wx-intel__stat-grid--compare">
          <PeriodStatCard snap={comparison.current} />
          <PeriodStatCard snap={comparison.lastYear} />
          <PeriodStatCard snap={comparison.fiveYearsAgo} />
        </ul>
      ) : (
        <p className="si-map-wx-intel__loading">Comparison unavailable.</p>
      )}
    </section>
  );
}
