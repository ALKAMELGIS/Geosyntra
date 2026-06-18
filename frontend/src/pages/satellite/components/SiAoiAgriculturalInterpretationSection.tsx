import type {
  SiAoiAgriculturalInterpretation,
  SiAoiInterpretationMetrics,
  SiAoiRiskLevel,
} from '../utils/siAoiAgriculturalInterpretation';
import { formatLatestImageryDateLine } from '../utils/siAoiAgriculturalInterpretation';
import { formatSharePctWithHa } from '../utils/siAoiReportAreaFormat';

function riskClass(level: SiAoiRiskLevel): string {
  if (level === 'High') return 'si-aoi-yield__risk si-aoi-yield__risk--high';
  if (level === 'Medium') return 'si-aoi-yield__risk si-aoi-yield__risk--mid';
  return 'si-aoi-yield__risk si-aoi-yield__risk--low';
}

export type SiAoiAgriculturalInterpretationSectionProps = {
  interpretation: SiAoiAgriculturalInterpretation | null;
  metrics: SiAoiInterpretationMetrics | null;
  loading?: boolean;
  error?: string | null;
  geminiActive?: boolean;
  sectionTitle?: string;
  sectionSubtitle?: string;
};

export function SiAoiAgriculturalInterpretationSection({
  interpretation,
  metrics,
  loading = false,
  error = null,
  geminiActive = false,
  sectionTitle = 'Yield insight — interpretation',
  sectionSubtitle = 'Domain reading for decisions — compares productive vs stressed hectares with NDVI, NDMI, temperature, and soil moisture from satellite imagery',
}: SiAoiAgriculturalInterpretationSectionProps) {
  if (loading) {
    return (
      <div className="si-aoi-report-card si-aoi-yield" aria-live="polite">
        <h3>{sectionTitle}</h3>
        <p className="si-aoi-yield__status">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Building interpretation…
        </p>
      </div>
    );
  }

  if (!interpretation) {
    return (
      <div className="si-aoi-report-card si-aoi-yield si-aoi-yield--empty">
        <h3>{sectionTitle}</h3>
        <p className="si-aoi-yield__status">{error || 'Interpretation is not available for this report.'}</p>
      </div>
    );
  }

  const ag = interpretation;

  return (
    <div className="si-aoi-report-card si-aoi-yield" id="si-aoi-yield-interpretation">
      <div className="si-aoi-yield__head">
        <h3>{sectionTitle}</h3>
        <span className={riskClass(ag.riskLevel)} role="status">
          Risk: {ag.riskLevel}
        </span>
      </div>
      <p className="si-aoi-yield__sub">
        {sectionSubtitle}
        {geminiActive ? ' (Gemini-assisted).' : ' (local analysis).'}
      </p>

      {metrics ? (
        <div className="si-aoi-yield__metrics" dir="ltr">
          <span>
            High vigor{' '}
            <strong>{formatSharePctWithHa(metrics.healthyAreaPct, metrics.aoiAreaKm2)}</strong>
          </span>
          <span>
            Stressed{' '}
            <strong>{formatSharePctWithHa(metrics.stressedAreaPct, metrics.aoiAreaKm2)}</strong>
          </span>
          {metrics.ndviMean != null ? (
            <span>
              NDVI <strong>{metrics.ndviMean.toFixed(2)}</strong>
            </span>
          ) : null}
          {metrics.ndmiMean != null ? (
            <span>
              NDMI <strong>{metrics.ndmiMean.toFixed(2)}</strong>
            </span>
          ) : null}
          {metrics.ndwiMean != null ? (
            <span>
              NDWI <strong>{metrics.ndwiMean.toFixed(2)}</strong>
            </span>
          ) : null}
          {metrics.lstMeanC != null ? (
            <span>
              LST <strong>{metrics.lstMeanC.toFixed(1)}°C</strong>
            </span>
          ) : null}
          {metrics.soilMoisturePct != null ? (
            <span>
              Soil (NDMI) <strong>{metrics.soilMoisturePct}%</strong>
            </span>
          ) : null}
          {metrics.waterPct != null ? (
            <span>
              Water (NDWI) <strong>{metrics.waterPct}%</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="si-aoi-yield__condition">{ag.cropCondition}</p>
      <p className="si-aoi-yield__impact">{ag.yieldImpact}</p>

      {ag.riskCause ? <p className="si-aoi-yield__cause">Stress drivers: {ag.riskCause}</p> : null}

      <h4 className="si-aoi-yield__section-label">Interpretation</h4>
      <ul className="si-aoi-yield__list">
        {ag.insights.map(line => (
          <li key={line.slice(0, 48)}>{line}</li>
        ))}
        <li className="si-aoi-yield__list-temporal">{formatLatestImageryDateLine(ag.latestImageryDate)}</li>
        <li className="si-aoi-yield__list-temporal">{ag.temporalInsightForecast}</li>
      </ul>

      <h4 className="si-aoi-yield__section-label">Recommendations</h4>
      <ul className="si-aoi-yield__list si-aoi-yield__list--rec">
        {ag.recommendations.map(line => (
          <li key={line.slice(0, 48)}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
