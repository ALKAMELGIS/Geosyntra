import type { ReactNode } from 'react';
import type { SiAoiZonalAnalytics } from '../utils/siAoiZonalStats';
import { roundIndexDisplay } from '../utils/siAoiZonalStats';
import type { StaticAoiChartLayerId } from '../utils/staticAoiMultiChartData';
import { STATIC_AOI_CHART_LAYER_OPTIONS } from '../utils/staticAoiMultiChartData';

export type SiAoiZonalPopupBodyProps = {
  analytics: SiAoiZonalAnalytics | null;
  highlightLayers?: StaticAoiChartLayerId[];
  areaDisplay: ReactNode;
};

function formatResolution(m: number | null): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  if (m >= 10) return `${m.toFixed(1)} m`;
  return `${m.toFixed(2)} m`;
}

export function SiAoiZonalPopupBody({
  analytics,
  highlightLayers = ['NDVI', 'NDWI', 'SAVI'],
  areaDisplay,
}: SiAoiZonalPopupBodyProps) {
  const layers = highlightLayers
    .map(id => STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === id))
    .filter(Boolean);

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

      {layers.length > 0 ? (
        <div className="si-multi-aoi-popup__spectral" aria-label="Index zonal statistics">
          <div className="si-multi-aoi-popup__spectral-kicker">Index statistics (AOI mean)</div>
          <ul className="si-multi-aoi-popup__spectral-list si-multi-aoi-popup__spectral-list--detailed" role="list">
            {layers.map(opt => {
              if (!opt) return null;
              const st = analytics?.indices[opt.id];
              if (!st) return null;
              return (
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
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
