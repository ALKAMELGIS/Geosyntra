import type { ReactNode } from 'react';
import type {
  SiAoiIndexHealthBreakdown,
  SiAoiIndexHealthRow,
  SiAoiZonalAnalytics,
  SiAoiZonalIndexStats,
} from '../utils/siAoiZonalStats';
import { roundIndexDisplay } from '../utils/siAoiZonalStats';
import type { StaticAoiChartLayerId } from '../utils/staticAoiMultiChartData';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from '../utils/staticAoiMultiChartData';

export type SiAoiZonalPopupBodyProps = {
  analytics: SiAoiZonalAnalytics | null;
  indexHealth: SiAoiIndexHealthBreakdown | null;
  highlightLayers?: StaticAoiChartLayerId[];
  areaDisplay: ReactNode;
};

function formatResolution(m: number | null): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 10) return `${m.toFixed(1)} m`;
  return `${m.toFixed(2)} m`;
}

function formatHa(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 10) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function spectralValueToneClass(row: SiAoiIndexHealthRow): string {
  if (row.tone === 'high') return 'si-multi-aoi-popup__spectral-value--good';
  if (row.tone === 'medium') return 'si-multi-aoi-popup__spectral-value--mid';
  return 'si-multi-aoi-popup__spectral-value--poor';
}

export function SiAoiZonalPopupBody({
  analytics,
  indexHealth,
  highlightLayers = ['NDVI', 'NDWI', 'SAVI'],
  areaDisplay,
}: SiAoiZonalPopupBodyProps) {
  const spectralRows: Array<{
    opt: (typeof STATIC_AOI_CHART_LAYER_OPTIONS)[number];
    st: SiAoiZonalIndexStats;
  }> = [];

  for (const id of highlightLayers) {
    const opt = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id);
    const st = analytics?.indices[id];
    if (opt && st) spectralRows.push({ opt, st });
  }

  const healthRows = indexHealth?.rows ?? [];
  const healthLayerId = indexHealth?.layerId;

  return (
    <>
      <div className="si-multi-aoi-popup__area">
        <span className="si-multi-aoi-popup__area-label">Total area</span>
        <span className="si-multi-aoi-popup__area-value">{areaDisplay}</span>
      </div>

      <div className="si-multi-aoi-popup__metrics" aria-label="AOI analysis metrics">
        <div className="si-multi-aoi-popup__metric-row">
          <span className="si-multi-aoi-popup__metric-k">Pixel count</span>
          <span className="si-multi-aoi-popup__metric-v" dir="ltr">
            {analytics ? analytics.pixelCount.toLocaleString('en-US') : '—'}
          </span>
        </div>
        <div className="si-multi-aoi-popup__metric-row">
          <span className="si-multi-aoi-popup__metric-k">Valid pixels</span>
          <span className="si-multi-aoi-popup__metric-v" dir="ltr">
            {analytics ? analytics.validPixelCount.toLocaleString('en-US') : '—'}
          </span>
        </div>
        <div className="si-multi-aoi-popup__metric-row">
          <span className="si-multi-aoi-popup__metric-k">Analysis date</span>
          <span className="si-multi-aoi-popup__metric-v" dir="ltr">
            {analytics?.analysisDateIso || '—'}
          </span>
        </div>
        <div className="si-multi-aoi-popup__metric-row">
          <span className="si-multi-aoi-popup__metric-k">Resolution (approx.)</span>
          <span className="si-multi-aoi-popup__metric-v" dir="ltr">
            {formatResolution(analytics?.approxResolutionM ?? null)}
          </span>
        </div>
      </div>

      {healthRows.length > 0 ? (
        <div className="si-multi-aoi-popup__spectral" aria-label="Index analysis">
          <div className="si-multi-aoi-popup__spectral-kicker">
            Index analysis
            {indexHealth ? (
              <span className="si-multi-aoi-popup__spectral-sub">
                {' '}
                · {indexHealth.layerLabel} mean {roundIndexDisplay(indexHealth.primaryMean, healthLayerId)}
              </span>
            ) : null}
          </div>
          <ul className="si-multi-aoi-popup__spectral-list" role="list">
            {[...healthRows].reverse().map(row => (
              <li key={row.band} className="si-multi-aoi-popup__spectral-item">
                <span className="si-multi-aoi-popup__spectral-name">
                  <span
                    className="si-multi-aoi-popup__spectral-swatch"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  {row.label}
                </span>
                <span
                  className={`si-multi-aoi-popup__spectral-value ${spectralValueToneClass(row)}`}
                  dir="ltr"
                >
                  <span className="si-multi-aoi-popup__spectral-num">
                    {row.pct.toFixed(1)}%
                  </span>
                  <span className="si-multi-aoi-popup__spectral-arr" aria-hidden>
                    ·
                  </span>
                  <span className="si-multi-aoi-popup__spectral-num">{formatHa(row.areaHa)} ha</span>
                  <span className="si-multi-aoi-popup__spectral-arr" aria-hidden>
                    ·
                  </span>
                  <span className="si-multi-aoi-popup__spectral-num">
                    μ {roundIndexDisplay(row.meanIndex, healthLayerId)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {spectralRows.length > 0 ? (
        <div className="si-multi-aoi-popup__spectral" aria-label="Index zonal statistics">
          <div className="si-multi-aoi-popup__spectral-kicker">Index statistics (AOI mean)</div>
          <ul
            className="si-multi-aoi-popup__spectral-list si-multi-aoi-popup__spectral-list--detailed"
            role="list"
          >
            {spectralRows.map(({ opt, st }) => (
              <li key={opt.id} className="si-multi-aoi-popup__index-block">
                <div className="si-multi-aoi-popup__index-head">{opt.label}</div>
                <div className="si-multi-aoi-popup__index-grid">
                  <span>
                    <em>Mean</em> {roundIndexDisplay(st.mean, opt.id)}
                  </span>
                  <span>
                    <em>Min</em> {roundIndexDisplay(st.min, opt.id)}
                  </span>
                  <span>
                    <em>Max</em> {roundIndexDisplay(st.max, opt.id)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
