import { useMemo } from 'react';
import {
  Chart as ChartJS,
  type ChartOptions,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, zoomPlugin);

export type AoiStaticMultiLayerLineChartDataset = {
  id: string;
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  yAxisID: string;
};

export type AoiStaticMultiLayerLineChartProps = {
  title: string;
  labels: string[];
  datasets: AoiStaticMultiLayerLineChartDataset[];
  /** When true, show right axis for land-surface temperature. */
  hasLst: boolean;
};

export function AoiStaticMultiLayerLineChart({ title, labels, datasets, hasLst }: AoiStaticMultiLayerLineChartProps) {
  const data = useMemo(
    () => ({
      labels,
      datasets: datasets.map(ds => ({
        ...ds,
        fill: false,
        tension: 0.32,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        spanGaps: true,
      })),
    }),
    [labels, datasets],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        title: {
          display: true,
          text: title,
          color: '#1e293b',
          font: { size: 13, weight: 600 },
          padding: { bottom: 8 },
        },
        legend: {
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            color: '#334155',
            font: { size: 11, weight: 600 },
          },
          onClick: (_evt: unknown, legendItem: { datasetIndex?: number }, legend: { chart?: ChartJS }) => {
            const chart = legend.chart;
            const i = legendItem.datasetIndex;
            if (!chart || i == null) return;
            const vis = chart.isDatasetVisible(i);
            chart.setDatasetVisibility(i, !vis);
            chart.update();
          },
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          titleColor: '#f1f5f9',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx: { dataset: { label?: string }; parsed: { y: number | null } }) {
              const y = ctx.parsed.y;
              if (y == null || Number.isNaN(y)) return `${ctx.dataset.label ?? ''}: —`;
              return `${ctx.dataset.label ?? ''}: ${y}`;
            },
          },
        },
        zoom: {
          limits: { x: { minRange: 2 } },
          pan: { enabled: true, mode: 'x' as const },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x' as const,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.18)' },
          ticks: { color: '#475569', maxRotation: 40, minRotation: 0, font: { size: 10 } },
        },
        yIndex: {
          type: 'linear' as const,
          position: 'left' as const,
          display: datasets.some(d => d.yAxisID === 'yIndex'),
          stacked: false,
          title: {
            display: true,
            text: 'Spectral index (−1 … 1)',
            color: '#475569',
            font: { size: 11, weight: 600 },
          },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
          ticks: { color: '#64748b' },
          suggestedMin: -1,
          suggestedMax: 1,
        },
        yLST: {
          type: 'linear' as const,
          position: 'right' as const,
          display: hasLst && datasets.some(d => d.yAxisID === 'yLST'),
          title: {
            display: true,
            text: 'LST (°C)',
            color: '#475569',
            font: { size: 11, weight: 600 },
          },
          grid: { drawOnChartArea: false },
          ticks: { color: '#64748b' },
        },
      },
    }),
    [title, datasets, hasLst],
  ) as ChartOptions<'line'>;

  if (!labels.length || !datasets.length) {
    return (
      <div className="si-aoi-static-line-empty">
        <p className="si-aoi-static-line-empty-title">No timeline yet</p>
        <p className="si-aoi-static-line-empty-hint">
          Draw an AOI, pick layers below, then use <strong>Generate timeline</strong> in Remote Sensing to load weeks on
          the X-axis.
        </p>
      </div>
    );
  }

  return (
    <div className="si-aoi-static-line-wrap">
      <Line data={data} options={options} />
    </div>
  );
}
