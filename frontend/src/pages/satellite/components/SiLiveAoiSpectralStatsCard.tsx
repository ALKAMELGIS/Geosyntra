import type { LiveAoiMapChartSnapshot } from '../utils/liveAoiMapChartSnapshot';
import {
  formatActiveIndexStat,
  formatEnvironmentalDisplay,
} from '../utils/liveAoiEnvironmentalIndicators';

export function SiLiveAoiSpectralStatsCard({ snapshot }: { snapshot: LiveAoiMapChartSnapshot }) {
  if (!snapshot.activeIndexStats) return null;
  const isRaster = snapshot.dataSource === 'raster';

  const st = snapshot.activeIndexStats;
  const envFmt = snapshot.environmental ? formatEnvironmentalDisplay(snapshot.environmental) : null;

  return (
    <div className="si-map-analysis-chart-card si-live-aoi-spectral-stats">
      <p className="si-live-aoi-live-banner">
        <span className="si-live-aoi-live-dot" aria-hidden />
        {isRaster ? 'Live · pixel-based' : 'Live · map layer'} · {snapshot.liveLayerLabel ?? 'Sentinel-2'} ·{' '}
        {snapshot.activeLayerLabel}
        {snapshot.updatedAtIso
          ? ` · Updated ${new Date(snapshot.updatedAtIso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </p>
      <div className="si-map-analysis-chart-kicker">AOI spectral analysis · {snapshot.activeLayerLabel}</div>
      <p className="si-live-aoi-spectral-sample">
        Live layer: {snapshot.liveLayerLabel ?? 'Sentinel-2'} · Index: {snapshot.activeLayerLabel}
      </p>
      <div className="si-live-aoi-stats-grid">
        <div>
          <span className="si-live-aoi-stat-k">Mean</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.mean, st.layerId, 'mean')}</span>
        </div>
        <div>
          <span className="si-live-aoi-stat-k">Min</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.min, st.layerId, 'min')}</span>
        </div>
        <div>
          <span className="si-live-aoi-stat-k">Max</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.max, st.layerId, 'max')}</span>
        </div>
        <div>
          <span className="si-live-aoi-stat-k">Std dev</span>
          <span className="si-live-aoi-stat-v">{formatActiveIndexStat(st.std, st.layerId, 'std')}</span>
        </div>
        {isRaster && st.validPixelCount > 0 ? (
          <div>
            <span className="si-live-aoi-stat-k">Pixel count</span>
            <span className="si-live-aoi-stat-v">{st.validPixelCount.toLocaleString('en-US')}</span>
          </div>
        ) : null}
      </div>
      {envFmt ? (
        <div className="si-live-aoi-env-row">
          <div className="si-live-aoi-env-chip">
            <span>Moisture</span>
            <strong>{envFmt.moisture}</strong>
          </div>
          <div className="si-live-aoi-env-chip">
            <span>Surface temp</span>
            <strong>{envFmt.surfaceTemp}</strong>
          </div>
          <div className="si-live-aoi-env-chip">
            <span>Humidity</span>
            <strong>{envFmt.humidity}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
