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

ChartJS.register(LinearScale, PointElement, LineElement, LineController, ScatterController, Title, Tooltip, Legend);

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

  const chartData = useMemo(() => {
    if (!model || !Number.isFinite(model.slope) || !Number.isFinite(model.intercept)) {
      return {
        datasets: [
          {
            type: 'scatter' as const,
            label: 'AOI sample cells',
            data: model?.points ?? [],
            backgroundColor: 'rgba(56, 189, 248, 0.32)',
            borderColor: 'rgba(125, 211, 252, 0.55)',
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      };
    }
    const xs = model.points.map(p => p.x);
    const mn = Math.min(...xs);
    const mx = Math.max(...xs);
    const linePts = [
      { x: mn, y: model.slope * mn + model.intercept },
      { x: mx, y: model.slope * mx + model.intercept },
    ];
    const r2s = Number.isFinite(model.r2) ? model.r2.toFixed(3) : '—';
    return {
      datasets: [
        {
          type: 'scatter' as const,
          label: 'AOI sample cells',
          data: model.points,
          backgroundColor: 'rgba(56, 189, 248, 0.32)',
          borderColor: 'rgba(125, 211, 252, 0.55)',
          pointRadius: 3,
          pointHoverRadius: 6,
        },
        {
          type: 'line' as const,
          label: `OLS · R² = ${r2s}`,
          data: linePts,
          borderColor: '#93c5fd',
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          tension: 0,
        },
      ],
    };
  }, [model]);

  const xLst = report.indexId === 'LST';
  const yLst = yIndexId === 'LST';

  const options = useMemo<ChartOptions<'scatter'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        title: {
          display: true,
          text: `Pixel scatter · ${model?.weekLabel ? `${model.weekLabel} · ` : ''}${model?.xLabel ?? ''} vs ${STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === yIndexId)?.label ?? yIndexId}`,
          color: '#e2e8f0',
          font: { size: 12, weight: 600 },
          padding: { bottom: 6 },
        },
        legend: {
          labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 10 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#f1f5f9',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          callbacks: {
            label(ctx) {
              if (ctx.datasetIndex === 1) return ctx.dataset.label ?? '';
              const px = ctx.parsed;
              if (!px || typeof px.x !== 'number') return '';
              return [
                `${model?.xLabel ?? 'X'}: ${px.x}`,
                `${STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === yIndexId)?.label ?? 'Y'}: ${px.y}`,
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
            font: { size: 11, weight: 600 },
          },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
          ticks: { color: '#94a3b8' },
          ...(xLst ? { suggestedMin: 15, suggestedMax: 45 } : { suggestedMin: -1, suggestedMax: 1 }),
        },
        y: {
          title: {
            display: true,
            text: `${STATIC_AOI_CHART_LAYER_OPTIONS.find(o => o.id === yIndexId)?.label ?? yIndexId}${yLst ? ' (°C)' : ''}`,
            color: '#94a3b8',
            font: { size: 11, weight: 600 },
          },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
          ticks: { color: '#94a3b8' },
          ...(yLst ? { suggestedMin: 15, suggestedMax: 45 } : { suggestedMin: -1, suggestedMax: 1 }),
        },
      },
    }),
    [model, report.indexId, yIndexId, xLst, yLst],
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
          Each point is one AOI grid cell (client-side demo). Values use the same synthetic index engine as the timeline;
          replace with true per-pixel stacks when zonal stats are connected.
        </p>
      </div>
      <div className="si-aoi-report-scatter-chart-wrap">
        <Chart type="scatter" data={chartData as any} options={options as any} />
      </div>
    </div>
  );
}
