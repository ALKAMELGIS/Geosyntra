import { useMemo } from 'react';
import { AoiStaticMultiLayerLineChart, type AoiStaticMultiLayerLineChartDataset } from './AoiStaticMultiLayerLineChart';
import {
  STATIC_AOI_CHART_LAYER_OPTIONS,
  type StaticAoiChartLayerId,
} from '../utils/staticAoiMultiChartData';
import './satelliteMapAnalysisChrome.css';

function sparkPathForOverlay(values: number[], w: number, h: number): string {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(' L ')}`;
}

export type SatelliteAoiStaticChartsMapOverlayProps = {
  open: boolean;
  onClose: () => void;
  indexLabel: string;
  staticComparisonLayers: StaticAoiChartLayerId[];
  onStaticComparisonLayerToggle: (id: StaticAoiChartLayerId) => void;
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  weeklyMeans: number[];
  pivotBars: Array<{ name: string; value: number }>;
};

/** Floating “AOI static charts” panel on the map (layer chips, multi-line chart, spark / bar / pie). */
export function SatelliteAoiStaticChartsMapOverlay({
  open,
  onClose,
  indexLabel,
  staticComparisonLayers,
  onStaticComparisonLayerToggle,
  staticMultiLineLabels,
  staticMultiLineDatasets,
  staticMultiLineHasLst,
  weeklyMeans,
  pivotBars,
}: SatelliteAoiStaticChartsMapOverlayProps) {
  const maxPivot = pivotBars.length ? Math.max(...pivotBars.map(p => Math.abs(p.value))) : 1;

  const sparkD = useMemo(
    () => sparkPathForOverlay(weeklyMeans.length ? weeklyMeans : [0], 120, 40),
    [weeklyMeans],
  );

  if (!open) return null;

  return (
    <div className="si-map-analysis-charts" role="dialog" aria-modal="false" aria-label="AOI static charts">
      <div className="si-map-analysis-charts-head">
        <div className="si-map-analysis-charts-head-text">
          <div className="si-map-analysis-charts-title">AOI static charts</div>
          <div className="si-map-analysis-charts-subtitle">
            {indexLabel} · multi-layer timeline (sample). Legend click toggles lines; wheel zooms X.
          </div>
        </div>
        <button
          type="button"
          className="si-map-analysis-charts-close"
          aria-label="Close AOI charts"
          title="Close"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>

      <div className="si-map-analysis-charts-multiline">
        <div className="si-map-analysis-layer-toolbar" role="group" aria-label="WMS comparison layers">
          {STATIC_AOI_CHART_LAYER_OPTIONS.map(opt => {
            const on = staticComparisonLayers.includes(opt.id);
            const onlyOne = staticComparisonLayers.length <= 1;
            return (
              <button
                key={opt.id}
                type="button"
                className={`si-map-analysis-layer-chip ${on ? 'si-map-analysis-layer-chip--on' : ''}`}
                title={opt.subtitle}
                aria-pressed={on}
                disabled={on && onlyOne}
                onClick={() => onStaticComparisonLayerToggle(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <AoiStaticMultiLayerLineChart
          title="Raster mean in AOI by week"
          labels={staticMultiLineLabels}
          datasets={staticMultiLineDatasets}
          hasLst={staticMultiLineHasLst}
        />
      </div>

      <div className="si-map-analysis-charts-grid si-map-analysis-charts-grid--below">
        <div className="si-map-analysis-chart-card">
          <div className="si-map-analysis-chart-kicker">Time series (spark)</div>
          <svg className="si-map-analysis-spark" viewBox="0 0 120 40" preserveAspectRatio="none">
            <path
              className="si-map-analysis-spark-path"
              d={sparkD}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="si-map-analysis-chart-card">
          <div className="si-map-analysis-chart-kicker">Fields (bar)</div>
          <div className="si-map-analysis-bars">
            {pivotBars.slice(0, 8).map(row => (
              <div key={row.name} className="si-map-analysis-bar-row">
                <span className="si-map-analysis-bar-name">{row.name}</span>
                <div className="si-map-analysis-bar-track">
                  <span
                    className="si-map-analysis-bar-fill"
                    style={{ width: `${Math.min(100, (Math.abs(row.value) / maxPivot) * 100)}%` }}
                  />
                </div>
                <span className="si-map-analysis-bar-val">{row.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="si-map-analysis-chart-card si-map-analysis-chart-card--pie">
          <div className="si-map-analysis-chart-kicker">Mix (pie)</div>
          <div className="si-map-analysis-pie-wrap">
            {pivotBars.slice(0, 6).map((row, i, arr) => {
              const sum = arr.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
              const pct = (Math.abs(row.value) / sum) * 100;
              const hue = 140 + i * 28;
              return (
                <div key={row.name} className="si-map-analysis-pie-seg">
                  <span className="si-map-analysis-pie-dot" style={{ background: `hsl(${hue} 65% 46%)` }} />
                  <span className="si-map-analysis-pie-lbl">{row.name}</span>
                  <span className="si-map-analysis-pie-pct">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
