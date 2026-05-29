import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { STATIC_AOI_CHART_LAYER_OPTIONS, type StaticAoiChartLayerId } from '../utils/staticAoiMultiChartData';
import type { SiAoiReportModel } from '../utils/siAoiVegetationReportModel';
import { buildSiAoiPixelScatterModel } from '../utils/siAoiReportPixelScatter';
import {
  chartStatTickLabel,
  formatOlsAnnotationLines,
  formatOlsRegressionLegend,
  scatterAxisBounds,
  scatterPixelColors,
  scatterPointRadiusForCount,
  siScatterOlsAnnotationPlugin,
  SI_SCATTER_OLS_LINE_COLOR,
  SI_SCATTER_OLS_LINE_WIDTH,
} from '../utils/siChartStatFormat';

ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  siScatterOlsAnnotationPlugin,
);

export type SiAoiReportPixelScatterBlockProps = {
  report: SiAoiReportModel;
  /** Weekly composite means (same order as report build) for synthetic index anchor. */
  weeklyMeans: number[];
};

export function SiAoiReportPixelScatterBlock({ report, weeklyMeans }: SiAoiReportPixelScatterBlockProps) {
  const [yIndexId, setYIndexId] = useState<StaticAoiChartLayerId>(() => {
    const first = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id !== report.indexId);
    return first?.id ?? 'NDWI';
  });

  useEffect(() => {
    if (yIndexId === report.indexId) {
      const first = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id !== report.indexId);
      if (first) setYIndexId(first.id);
    }
  }, [report.indexId, yIndexId]);

  const model = useMemo(
    () => buildSiAoiPixelScatterModel(report, yIndexId, weeklyMeans, 440),
    [report, yIndexId, weeklyMeans],
  );

  const yLabel = STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === yIndexId)?.label ?? yIndexId;
  const xLst = report.indexId === 'LST';
  const yLst = yIndexId === 'LST';

  const chartData = useMemo(() => {
    if (!model) {
      return { datasets: [] };
    }
    const xs = model.points.map(p => p.x);
    const ys = model.points.map(p => p.y);
    const mn = Math.min(...xs);
    const mx = Math.max(...xs);
    const linePts =
      Number.isFinite(model.slope) && Number.isFinite(model.intercept)
        ? [
            { x: mn, y: model.slope * mn + model.intercept },
            { x: mx, y: model.slope * mx + model.intercept },
          ]
        : null;
    const { radius, hover, borderWidth } = scatterPointRadiusForCount(model.points.length);
    const dense = model.points.length > 600;
    const pixelColors = scatterPixelColors(false, dense);
    const olsLabel = formatOlsRegressionLegend({
      yLabel,
      xLabel: model.xLabel,
      slope: model.slope,
      intercept: model.intercept,
      r2: model.r2,
    });
    return {
      datasets: [
        {
          type: 'scatter' as const,
          label: `Pixels (n=${model.points.length})`,
          data: model.points,
          backgroundColor: pixelColors.fill,
          borderColor: pixelColors.stroke,
          borderWidth,
          pointRadius: radius,
          pointHoverRadius: hover,
          order: 2,
        },
        ...(linePts
          ? [
              {
                type: 'line' as const,
                label: olsLabel,
                data: linePts,
                borderColor: SI_SCATTER_OLS_LINE_COLOR,
                backgroundColor: 'transparent',
                borderWidth: SI_SCATTER_OLS_LINE_WIDTH,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0,
                order: 1,
              },
            ]
          : []),
      ],
    };
  }, [model, yLabel]);

  const xBounds = useMemo(
    () => scatterAxisBounds(model?.points.map(p => p.x) ?? [], xLst ? 'lst' : 'spectral'),
    [model, xLst],
  );
  const yBounds = useMemo(
    () => scatterAxisBounds(model?.points.map(p => p.y) ?? [], yLst ? 'lst' : 'spectral'),
    [model, yLst],
  );

  const olsAnnotationLines = useMemo(
    () =>
      model
        ? formatOlsAnnotationLines({
            yLabel,
            xLabel: model.xLabel,
            slope: model.slope,
            intercept: model.intercept,
            r2: model.r2,
          })
        : [],
    [model, yLabel],
  );

  const options = useMemo<ChartOptions<'scatter'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        title: {
          display: true,
          text: `${yLabel} vs ${model?.xLabel ?? ''}${model?.weekLabel ? ` · ${model.weekLabel}` : ''}`,
          color: '#e2e8f0',
          font: { size: 13, weight: 600 },
          padding: { bottom: 8 },
        },
        legend: { display: false },
        siScatterOlsAnnotation: {
          lines: olsAnnotationLines,
          color: '#f1f5f9',
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#f1f5f9',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          filter(ctx) {
            return ctx.datasetIndex === 0;
          },
          callbacks: {
            label(ctx) {
              const px = ctx.parsed;
              if (!px || typeof px.x !== 'number') return '';
              return [
                `${model?.xLabel ?? 'X'}: ${chartStatTickLabel(px.x)}`,
                `${yLabel}: ${chartStatTickLabel(px.y)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: `${model?.xLabel ?? ''}${xLst ? ' (°C)' : ''}`,
            color: '#94a3b8',
            font: { size: 12, weight: 600 },
          },
          grid: { color: 'rgba(148, 163, 184, 0.18)' },
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: 6,
            callback: (v: string | number) => chartStatTickLabel(v),
          },
          min: xBounds.min,
          max: xBounds.max,
        },
        y: {
          title: {
            display: true,
            text: `${yLabel}${yLst ? ' (°C)' : ''}`,
            color: '#94a3b8',
            font: { size: 12, weight: 600 },
          },
          grid: { color: 'rgba(148, 163, 184, 0.18)' },
          ticks: {
            color: '#94a3b8',
            maxTicksLimit: 6,
            callback: (v: string | number) => chartStatTickLabel(v),
          },
          min: yBounds.min,
          max: yBounds.max,
        },
      },
    }),
    [model, yLabel, xLst, yLst, xBounds, yBounds, olsAnnotationLines],
  );

  if (!model) {
    return (
      <p className="si-aoi-report-analysis si-aoi-report-analysis--compact">
        Not enough AOI pixel samples for a scatter plot. Generate the report again after the classification grid is built.
      </p>
    );
  }

  return (
    <div className="si-aoi-report-scatter-block">
      <div className="si-aoi-report-scatter-controls">
        <label className="si-aoi-report-scatter-y-label">
          Y axis (compare)
          <select
            className="si-aoi-report-scatter-y-select"
            value={yIndexId}
            onChange={e => setYIndexId(e.target.value as StaticAoiChartLayerId)}
          >
            {STATIC_AOI_CHART_LAYER_OPTIONS.filter(o => o.id !== report.indexId).map(o => (
              <option key={o.id} value={o.id}>
                {o.label} — {o.subtitle}
              </option>
            ))}
          </select>
        </label>
        <p className="si-aoi-report-scatter-hint">
          Each point is one AOI grid cell. Red line = OLS fit; equation and R² appear in the chart corner.
        </p>
      </div>
      <div className="si-aoi-report-scatter-chart-wrap">
        <Chart type="scatter" data={chartData as any} options={options as any} />
      </div>
    </div>
  );
}
