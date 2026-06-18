import type { SiAoiReportLiveAnalysisSnapshot } from '../utils/siAoiReportLiveAnalysisSnapshot';
import { formatReportIndexValue } from '../utils/siAoiReportLiveAnalysisSnapshot';
import { formatAreaTriple } from '../utils/siIndexClassAnalytics';
import { formatNumericRangeDisplay, stageForIndexClassRow } from '../utils/siCropGrowthStage';
/* Styles loaded from SatelliteIntelligenceMain.tsx (see SiAoiReportModal). */

export type SiAoiReportLiveLayerAnalysisSectionProps = {
  snapshot: SiAoiReportLiveAnalysisSnapshot;
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="si-report-live__metric">
      <span className="si-report-live__metric-k">{label}</span>
      <span className="si-report-live__metric-v">{value}</span>
    </div>
  );
}

export function SiAoiReportLiveLayerAnalysisSection({
  snapshot,
}: SiAoiReportLiveLayerAnalysisSectionProps) {
  const area = formatAreaTriple(snapshot.areaM2);
  const cover = snapshot.cover;
  const classes = snapshot.classRows;
  const stageCtx = {
    activeLayerId: snapshot.activeLayerId,
    ndviMean: snapshot.indices.NDVI?.mean ?? null,
    ndmiMean: snapshot.indices.NDMI?.mean ?? null,
    eviMean: snapshot.indices.EVI?.mean ?? null,
  };

  return (
    <div className="si-aoi-report-card si-report-live" id="si-aoi-report-live-layer-analysis">
      <div className="si-report-live__head">
        <h3>Live layer analysis — {snapshot.activeLayerLabel}</h3>
        <span className="si-report-live__badge">
          <span className="si-report-live__dot" aria-hidden />
          AOI-clipped raster pixels
        </span>
      </div>
      <p className="si-report-live__lead">
        All statistics below are computed exclusively from masked pixels of{' '}
        <strong>{snapshot.activeLayerLabel}</strong> inside the AOI ({snapshot.analysisDateIso}). Captured{' '}
        {snapshot.capturedAtIso.slice(0, 19).replace('T', ' ')} UTC.
      </p>

      <div className="si-report-live__metrics">
        <Metric label="Imagery / analysis date" value={snapshot.analysisDateIso} />
        <Metric label="Total area" value={`${area.ha} ha · ${area.m2} m² · ${area.km2} km²`} />
        <Metric label="Valid pixels" value={snapshot.validPixelCount.toLocaleString('en-US')} />
        <Metric
          label="Layer mean"
          value={
            snapshot.healthPrimaryMean != null
              ? formatReportIndexValue(snapshot.healthPrimaryMean, snapshot.activeLayerId)
              : '—'
          }
        />
        <Metric label="Confidence" value={`${snapshot.confidencePct}% valid`} />
        {snapshot.approxResolutionM != null && snapshot.approxResolutionM > 0 ? (
          <Metric label="Resolution (approx.)" value={`${snapshot.approxResolutionM.toFixed(1)} m`} />
        ) : null}
      </div>

      {cover ? (
        <div className="si-report-live__block">
          <h4>Cover summary</h4>
          <ul className="si-report-live__health" role="list">
            <li className="si-report-live__health-row si-report-live__health-row--high">
              <span className="si-report-live__health-lbl">{cover.positiveLabel}</span>
              <span className="si-report-live__health-val" dir="ltr">
                {cover.positivePct.toFixed(1)}% · {formatAreaTriple(cover.positiveAreaM2).ha} ha ·{' '}
                {formatAreaTriple(cover.positiveAreaM2).m2} m²
              </span>
            </li>
            <li className="si-report-live__health-row si-report-live__health-row--low">
              <span className="si-report-live__health-lbl">{cover.negativeLabel}</span>
              <span className="si-report-live__health-val" dir="ltr">
                {cover.negativePct.toFixed(1)}% · {formatAreaTriple(cover.negativeAreaM2).ha} ha ·{' '}
                {formatAreaTriple(cover.negativeAreaM2).m2} m²
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      {classes.length > 0 ? (
        <div className="si-report-live__block">
          <h4>Classification legend ({snapshot.legendBandCount} bands)</h4>
          <table className="si-report-live__class-table">
            <thead>
              <tr>
                <th aria-hidden />
                <th>Class</th>
                <th>Stage (Crop Growth Stage)</th>
                <th>Area</th>
                <th>Share %</th>
              </tr>
            </thead>
            <tbody>
              {classes.map(c => (
                <tr key={c.classId}>
                  <td>
                    <span className="si-report-live__swatch" style={{ background: c.colorHex }} aria-hidden />
                  </td>
                  <td dir="ltr">{formatNumericRangeDisplay(c.label)}</td>
                  <td>{stageForIndexClassRow(c, stageCtx)}</td>
                  <td dir="ltr">{c.areaHa.toFixed(2)} ha</td>
                  <td dir="ltr">{c.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
