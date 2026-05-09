import { useMemo, useState } from 'react';
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
  const [chartTheme, setChartTheme] = useState<'dark' | 'light'>('dark');
  const isLight = chartTheme === 'light';
  const titleColor = isLight ? '#0f172a' : '#e2e8f0';
  const labelColor = isLight ? '#334155' : '#cbd5e1';
  const tickColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.14)';
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
          color: titleColor,
          font: { size: 13, weight: 600 },
          padding: { bottom: 8 },
        },
        legend: {
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            color: labelColor,
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
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.92)',
          titleColor: isLight ? '#0f172a' : '#f1f5f9',
          bodyColor: isLight ? '#1e293b' : '#e2e8f0',
          borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
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
          grid: { color: gridColor },
          ticks: { color: tickColor, maxRotation: 40, minRotation: 0, font: { size: 10 } },
        },
        yIndex: {
          type: 'linear' as const,
          position: 'left' as const,
          display: datasets.some(d => d.yAxisID === 'yIndex'),
          stacked: false,
          title: {
            display: true,
            text: 'Spectral index (−1 … 1)',
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor },
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
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor },
        },
      },
    }),
    [title, datasets, hasLst, titleColor, labelColor, tickColor, gridColor, isLight],
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
    <div className={`si-aoi-static-line-wrap ${isLight ? 'si-aoi-static-line-wrap--light' : 'si-aoi-static-line-wrap--dark'}`}>
      <button
        type="button"
        className="si-aoi-static-line-theme-toggle"
        aria-label={isLight ? 'Switch chart to dark theme' : 'Switch chart to light theme'}
        title={isLight ? 'Dark chart theme' : 'Light chart theme'}
        onClick={() => setChartTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
      >
        <i className={`fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
      </button>
      <Line data={data} options={options} />
    </div>
  );
}
