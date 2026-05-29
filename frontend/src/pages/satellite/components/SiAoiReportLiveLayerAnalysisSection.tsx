import type { SiAoiReportLiveAnalysisSnapshot } from '../utils/siAoiReportLiveAnalysisSnapshot';
import { formatReportIndexValue } from '../utils/siAoiReportLiveAnalysisSnapshot';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from '../utils/staticAoiChartTypes';
import './SiAoiReportLiveLayerAnalysisSection.css';

export type SiAoiReportLiveLayerAnalysisSectionProps = {
  snapshot: SiAoiReportLiveAnalysisSnapshot | null;
  loading?: boolean;
  error?: string | null;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="si-report-live__metric">
      <span className="si-report-live__metric-k">{label}</span>
      <span className="si-report-live__metric-v">{value}</span>
    </div>
  );
}

function IndexStatsBlock({
  layerId,
  st,
  active,
}: {
  layerId: StaticAoiChartLayerId;
  st: { mean: number; median?: number; min: number; max: number; std?: number };
  active: boolean;
}) {
  const label = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === layerId)?.label ?? layerId;
  const fmt = (v: number) => formatReportIndexValue(v, layerId);
  return (
    <div className={`si-report-live__index${active ? ' si-report-live__index--active' : ''}`}>
      <div className="si-report-live__index-title">{label}</div>
      <div className="si-report-live__stats-grid">
        <span>Mean</span>
        <strong>{fmt(st.mean)}</strong>
        <span>Median</span>
        <strong>{st.median != null ? fmt(st.median) : '—'}</strong>
        <span>Min</span>
        <strong>{fmt(st.min)}</strong>
        <span>Max</span>
        <strong>{fmt(st.max)}</strong>
        <span>Std dev</span>
        <strong>{st.std != null ? fmt(st.std) : '—'}</strong>
      </div>
    </div>
  );
}

export function SiAoiReportLiveLayerAnalysisSection({
  snapshot,
  loading = false,
  error = null,
}: SiAoiReportLiveLayerAnalysisSectionProps) {
  if (loading) {
    return (
      <div className="si-aoi-report-card si-report-live" aria-live="polite">
        <h3>Live layer analysis</h3>
        <p className="si-report-live__status">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Awaiting AOI-clipped raster analysis…
        </p>
        <div className="si-report-live__skeleton" />
        <div className="si-report-live__skeleton si-report-live__skeleton--short" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="si-aoi-report-card si-report-live si-report-live--empty" role="alert">
        <h3>Live layer analysis</h3>
        <p className="si-report-live__status">
          {error ||
            'No raster analysis snapshot is stored for this AOI. Ensure VITE_ANALYSIS_ENGINE_URL is set, wait for pixel sampling to finish, then regenerate the report.'}
        </p>
      </div>
    );
  }

  const layerIds = Object.keys(snapshot.indices) as StaticAoiChartLayerId[];

  return (
    <div className="si-aoi-report-card si-report-live" id="si-aoi-report-live-layer-analysis">
      <div className="si-report-live__head">
        <h3>Live layer analysis</h3>
        <span className="si-report-live__badge">
          <span className="si-report-live__dot" aria-hidden />
          AOI-clipped raster pixels
        </span>
      </div>
      <p className="si-report-live__lead">
        Statistics below are computed from Sentinel-2 STAC pixels inside the AOI — not from map symbology or preview
        colors. Captured {snapshot.capturedAtIso.slice(0, 19).replace('T', ' ')} UTC.
      </p>

      <div className="si-report-live__metrics">
        <Metric label="Analysis date" value={snapshot.analysisDateIso} />
        <Metric
          label="Total area"
          value={`${snapshot.areaHa.toLocaleString('en-US', { maximumFractionDigits: 2 })} ha · ${Math.round(snapshot.areaM2).toLocaleString('en-US')} m²`}
        />
        <Metric label="Pixel count" value={snapshot.pixelCount.toLocaleString('en-US')} />
        <Metric label="Valid pixels" value={snapshot.validPixelCount.toLocaleString('en-US')} />
        <Metric
          label="Resolution (approx.)"
          value={
            snapshot.approxResolutionM != null && snapshot.approxResolutionM > 0
              ? `${snapshot.approxResolutionM.toFixed(1)} m`
              : '—'
          }
        />
        <Metric label="Confidence" value={`${snapshot.confidencePct}% valid`} />
      </div>

      {snapshot.healthRows.length > 0 ? (
        <div className="si-report-live__block">
          <h4>
            {snapshot.healthLayerLabel} distribution · μ{' '}
            {snapshot.healthPrimaryMean != null
              ? formatReportIndexValue(snapshot.healthPrimaryMean, snapshot.activeLayerId)
              : '—'}
          </h4>
          <ul className="si-report-live__health" role="list">
            {[...snapshot.healthRows].reverse().map(row => (
              <li key={row.band} className={`si-report-live__health-row si-report-live__health-row--${row.tone}`}>
                <span className="si-report-live__health-lbl">{row.label.toUpperCase()}</span>
                <span className="si-report-live__health-val" dir="ltr">
                  {row.pct.toFixed(1)}% · {row.areaHa.toFixed(2)} ha · μ{' '}
                  {formatReportIndexValue(row.meanIndex, snapshot.activeLayerId)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot.landCover ? (
        <div className="si-report-live__block">
          <h4>Land cover (pixel classes)</h4>
          <div className="si-report-live__landcover">
            <span>Vegetation {snapshot.landCover.vegetationPct.toFixed(1)}%</span>
            <span>Water {snapshot.landCover.waterPct.toFixed(1)}%</span>
            <span>Urban {snapshot.landCover.urbanPct.toFixed(1)}%</span>
            <span>Soil {snapshot.landCover.soilPct.toFixed(1)}%</span>
          </div>
        </div>
      ) : null}

      <div className="si-report-live__block">
        <h4>Spectral indices (AOI mean)</h4>
        <div className="si-report-live__indices">
          {layerIds.map(id => {
            const st = snapshot.indices[id];
            if (!st) return null;
            return <IndexStatsBlock key={id} layerId={id} st={st} active={id === snapshot.activeLayerId} />;
          })}
        </div>
      </div>
    </div>
  );
}
