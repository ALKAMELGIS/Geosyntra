import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  type ChartOptions,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  LineController,
  BarController,
  PieController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import { appAlert } from '../../../lib/appDialog';
import type { SiAoiRasterPixelSample } from '../utils/siAoiZonalStats';
import type { StaticAoiChartLayerId, WeeklyCompositeLite } from '../utils/staticAoiMultiChartData';
import {
  buildStaticAoiIndexCrossScatterModel,
  regressionLineEndpoints,
  type StaticAoiIndexCrossScatterModel,
} from '../utils/staticAoiIndexCrossScatter';
import {
  chartStatTickLabel,
  formatOlsRegressionLegend,
  scatterAxisBounds,
  scatterPixelColors,
  scatterPointRadiusForCount,
  SI_SCATTER_OLS_LINE_COLOR,
  SI_SCATTER_OLS_LINE_WIDTH,
} from '../utils/siChartStatFormat';
import {
  downloadGeoAiIndexAnalyticalReportXlsx,
  type SiGeoAiIndexAnalyticalExportContext,
} from '../utils/siGeoAiIndexAnalyticalExport';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  LineController,
  BarController,
  PieController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
);

export type AoiStaticExportLngLat = { lng: number; lat: number };

export type AoiStaticMultiLayerLineChartDataset = {
  id: string;
  label: string;
  data: (number | null)[];
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
  /** One WGS84 point per timeline row for CSV export (inside AOI when provided). */
  exportLngLatPerRow?: AoiStaticExportLngLat[];
  /** Satellite Intelligence: open AOI vegetation report configuration. */
  onRequestGenerateReport?: () => void;
  /** When set with polygon AOI + weekly timeline, Excel export adds Data_Raw / Data_Classified / Summary / Class stats. */
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
  /** Map dock (default) vs AOI report preview — report keeps chart-type toolbar, forces dark theme. */
  presentation?: 'dock' | 'report';
  /** Disable Chart.js animations (PDF export host). */
  disableAnimation?: boolean;
  /** Polygon AOI for pixel-based index scatter (first two visible layer chips). */
  scatterAoiFeature?: GeoJSON.Feature | null;
  scatterAoiKey?: string | null;
  scatterWeekly?: WeeklyCompositeLite[];
  scatterWeekIndex?: number;
  /** MPC raster samples for active AOI — used when both layers are present. */
  scatterRasterSample?: SiAoiRasterPixelSample | null;
  /** True while weekly MPC raster samples are loading for the timeline chart. */
  rasterDataLoading?: boolean;
  /** At least one finite zonal mean exists in the timeline datasets. */
  hasRealRasterData?: boolean;
};

type StaticChartType = 'line' | 'bar' | 'scatter' | 'pie';

const AOI_STATIC_CHART_COLOR_STORAGE_KEY = 'geosyntra-si-aoi-static-chart-colors-v1';

function loadStoredIndexColors(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(AOI_STATIC_CHART_COLOR_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    return o as Record<string, string>;
  } catch {
    return {};
  }
}

/** `#rgb` → `#rrggbb` for `<input type="color">`; fallback `#64748b`. */
function toColorInputValue(cssHex: string): string {
  const h = String(cssHex ?? '').trim();
  if (!h.startsWith('#')) return '#64748b';
  if (h.length === 4) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (h.length === 7) return h.toLowerCase();
  return '#64748b';
}

function meanFinite(values: readonly (number | null)[]): number {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stat3(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '—';
}

/**
 * Regression read-out rendered BELOW the scatter plot so the plot area stays clean.
 * Shows the OLS equation, R², Pearson r, slope/intercept, sample size and fit strength.
 */
function ScatterRegressionStats({ model }: { model: StaticAoiIndexCrossScatterModel }) {
  const { slope, intercept, r2, n, xLabel, yLabel, weekLabel, dataSource } = model;
  // Pearson r for simple linear regression: |r| = √R², sign follows the slope.
  const r =
    Number.isFinite(r2) && Number.isFinite(slope)
      ? Math.sign(slope) * Math.sqrt(Math.max(0, Math.min(1, r2)))
      : NaN;
  const equation =
    Number.isFinite(slope) && Number.isFinite(intercept)
      ? `${yLabel} = ${stat3(slope)} × ${xLabel} ${intercept >= 0 ? '+' : '−'} ${stat3(Math.abs(intercept))}`
      : '—';
  const fit = !Number.isFinite(r2)
    ? '—'
    : r2 >= 0.5
      ? 'Strong'
      : r2 >= 0.2
        ? 'Moderate'
        : r2 >= 0.05
          ? 'Weak'
          : 'Negligible';
  const sourceLabel = dataSource === 'raster' ? 'MPC raster pixels' : 'AOI grid cells';

  return (
    <section className="si-aoi-scatter-stats" aria-label="Regression statistics">
      <div className="si-aoi-scatter-stats__equation">
        <span className="si-aoi-scatter-stats__equation-tag">OLS</span>
        <span className="si-aoi-scatter-stats__equation-value">{equation}</span>
      </div>
      <dl className="si-aoi-scatter-stats__grid">
        <div className="si-aoi-scatter-stats__cell">
          <dt>R²</dt>
          <dd>{stat3(r2)}</dd>
        </div>
        <div className="si-aoi-scatter-stats__cell">
          <dt>Correlation r</dt>
          <dd>{stat3(r)}</dd>
        </div>
        <div className="si-aoi-scatter-stats__cell">
          <dt>Slope</dt>
          <dd>{stat3(slope)}</dd>
        </div>
        <div className="si-aoi-scatter-stats__cell">
          <dt>Intercept</dt>
          <dd>{stat3(intercept)}</dd>
        </div>
        <div className="si-aoi-scatter-stats__cell">
          <dt>Records n</dt>
          <dd>{Number.isFinite(n) ? n.toLocaleString() : '—'}</dd>
        </div>
        <div className="si-aoi-scatter-stats__cell">
          <dt>Fit</dt>
          <dd>{fit}</dd>
        </div>
      </dl>
      <p className="si-aoi-scatter-stats__meta">
        {weekLabel ? `${weekLabel} · ` : ''}
        {sourceLabel} · {xLabel} vs {yLabel}
      </p>
    </section>
  );
}

export function AoiStaticMultiLayerLineChart({
  title,
  labels,
  datasets,
  hasLst,
  exportLngLatPerRow,
  onRequestGenerateReport,
  geoAiIndexAnalyticalExportContext = null,
  presentation = 'dock',
  disableAnimation = false,
  scatterAoiFeature = null,
  scatterAoiKey = null,
  scatterWeekly = [],
  scatterWeekIndex = 0,
  scatterRasterSample = null,
  rasterDataLoading = false,
  hasRealRasterData = true,
}: AoiStaticMultiLayerLineChartProps) {
  const isReport = presentation === 'report';
  const [chartTheme, setChartTheme] = useState<'dark' | 'light'>(() => (isReport ? 'dark' : 'dark'));
  const [chartType, setChartType] = useState<StaticChartType>('line');
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(loadStoredIndexColors);
  const [hiddenById, setHiddenById] = useState<Record<string, boolean>>({});
  const isLight = !isReport && chartTheme === 'light';
  const titleColor = isLight ? '#0f172a' : '#f2f3f8';
  const labelColor = isLight ? '#334155' : 'rgba(214, 216, 224, 0.85)';
  const tickColor = isLight ? '#475569' : 'rgba(214, 216, 224, 0.62)';
  const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(255, 255, 255, 0.06)';
  const chartTipBg = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(12, 12, 14, 0.92)';

  useEffect(() => {
    try {
      localStorage.setItem(AOI_STATIC_CHART_COLOR_STORAGE_KEY, JSON.stringify(colorOverrides));
    } catch {
      /* ignore quota / private mode */
    }
  }, [colorOverrides]);

  useEffect(() => {
    const ids = new Set(datasets.map(d => d.id));
    setHiddenById(prev => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [datasets]);

  const effectiveDatasets = useMemo(() => {
    return datasets.map(ds => {
      const rawBorder = colorOverrides[ds.id] ?? ds.borderColor;
      const solid = toColorInputValue(rawBorder);
      const backgroundColor =
        solid.length === 7 && solid.startsWith('#') ? `${solid}22` : ds.backgroundColor;
      return {
        ...ds,
        borderColor: solid,
        backgroundColor,
        hidden: hiddenById[ds.id] === true,
      };
    });
  }, [datasets, colorOverrides, hiddenById]);

  const toggleDatasetVisibility = useCallback((id: string) => {
    setHiddenById(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const zoomCfg =
    chartType === 'line'
      ? {
          limits: { x: { minRange: 2 } },
          pan: { enabled: true, mode: 'x' as const },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x' as const,
          },
        }
      : {
          pan: { enabled: false },
          zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: 'x' as const },
        };

  const lineBarData = useMemo(
    () => ({
      labels,
      datasets: effectiveDatasets.map(ds => ({
        ...ds,
        fill: false,
        tension: 0.32,
        pointRadius: chartType === 'line' ? 3 : 0,
        pointHoverRadius: chartType === 'line' ? 6 : 0,
        borderWidth: 2,
        spanGaps: true,
      })),
    }),
    [labels, effectiveDatasets, chartType],
  );

  const pieData = useMemo(() => {
    const visible = effectiveDatasets.filter(ds => !ds.hidden);
    if (!visible.length) {
      return {
        labels: ['—'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#475569'],
            borderColor: ['#334155'],
            borderWidth: 1,
          },
        ],
      };
    }
    return {
      labels: visible.map(ds => ds.label),
      datasets: [
        {
          data: visible.map(ds => {
            const m = meanFinite(ds.data);
            return Number.isFinite(m) ? m : 0;
          }),
          backgroundColor: visible.map(ds => ds.backgroundColor),
          borderColor: visible.map(ds => ds.borderColor),
          borderWidth: 1,
        },
      ],
    };
  }, [effectiveDatasets]);

  /** First two visible layers: per-AOI-pixel scatter + red OLS line + R². */
  const scatterIndexCross = useMemo(() => {
    const vis = effectiveDatasets.filter(ds => !ds.hidden);
    if (vis.length < 2) return null;
    const da = vis[0]!;
    const db = vis[1]!;
    const xId = da.id as StaticAoiChartLayerId;
    const yId = db.id as StaticAoiChartLayerId;

    const model = buildStaticAoiIndexCrossScatterModel({
      xLayerId: xId,
      yLayerId: yId,
      xLabel: da.label,
      yLabel: db.label,
      feature: scatterAoiFeature,
      aoiKey: scatterAoiKey,
      weekIdx: scatterWeekIndex,
      weekly: scatterWeekly.length ? scatterWeekly : labels.map((_, i) => ({
        weekIndex: i,
        startDate: labels[i] ?? '',
        endDate: labels[i] ?? '',
        mean: meanFinite(da.data) || 0.45,
      })),
      raster: scatterRasterSample,
      maxCells: 2800,
      allowSyntheticFallback: false,
    });

    if (!model) return { model: null, data: null, options: null, da, db };

    const linePts = regressionLineEndpoints(model);
    const { radius: pointRadius, hover: pointHoverRadius, borderWidth: pointBorderWidth } =
      scatterPointRadiusForCount(model.n);
    const dense = model.n > 600;
    const pixelColors = scatterPixelColors(isLight, dense);
    const olsLabel = formatOlsRegressionLegend({
      yLabel: model.yLabel,
      xLabel: model.xLabel,
      slope: model.slope,
      intercept: model.intercept,
      r2: model.r2,
    });
    const xBounds = scatterAxisBounds(
      model.points.map(p => p.x),
      model.xLst ? 'lst' : 'spectral',
    );
    const yBounds = scatterAxisBounds(
      model.points.map(p => p.y),
      model.yLst ? 'lst' : 'spectral',
    );

    const data = {
      datasets: [
        {
          type: 'scatter' as const,
          label: `Pixels (n=${model.n})`,
          data: model.points,
          backgroundColor: pixelColors.fill,
          borderColor: pixelColors.stroke,
          borderWidth: pointBorderWidth,
          pointRadius,
          pointHoverRadius,
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
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
                tension: 0,
                order: 1,
              },
            ]
          : []),
      ],
    };

    const tipBg = chartTipBg;
    const options: ChartOptions<'scatter'> = {
      responsive: true,
      maintainAspectRatio: false,
      ...(disableAnimation ? { animation: false as const } : {}),
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        // Keep the plot clean: equation / R² / stats are rendered in a panel below the chart.
        title: {
          display: true,
          text: `${model.yLabel} vs ${model.xLabel}`,
          color: titleColor,
          font: { size: 10, weight: 600 },
          padding: { bottom: 6 },
        },
        legend: { display: false },
        tooltip: {
          mode: 'nearest' as const,
          intersect: false,
          backgroundColor: tipBg,
          titleColor: isLight ? '#0f172a' : '#f1f5f9',
          bodyColor: isLight ? '#1e293b' : '#e2e8f0',
          borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          padding: 10,
          filter(ctx) {
            return ctx.datasetIndex === 0;
          },
          callbacks: {
            label(ctx: { parsed: { x: number; y: number } }) {
              return [
                `${model.xLabel}: ${chartStatTickLabel(ctx.parsed.x)}`,
                `${model.yLabel}: ${chartStatTickLabel(ctx.parsed.y)}`,
              ];
            },
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' as const },
          limits: { x: { minRange: 0.02 }, y: { minRange: 0.02 } },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' as const },
        },
      },
      scales: {
        x: {
          type: 'linear' as const,
          display: true,
          title: {
            display: true,
            text: `${model.xLabel}${model.xLst ? ' (°C)' : ''}`,
            color: labelColor,
            font: { size: 9, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            maxTicksLimit: 5,
            font: { size: 9 },
            callback: (v: string | number) => chartStatTickLabel(v),
          },
          min: xBounds.min,
          max: xBounds.max,
        },
        y: {
          type: 'linear' as const,
          display: true,
          title: {
            display: true,
            text: `${model.yLabel}${model.yLst ? ' (°C)' : ''}`,
            color: labelColor,
            font: { size: 9, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            maxTicksLimit: 6,
            font: { size: 9 },
            callback: (v: string | number) => chartStatTickLabel(v),
          },
          min: yBounds.min,
          max: yBounds.max,
        },
      },
    };
    return { model, data, options, da, db };
  }, [
    effectiveDatasets,
    scatterAoiFeature,
    scatterAoiKey,
    scatterWeekIndex,
    scatterWeekly,
    scatterRasterSample,
    labels,
    title,
    titleColor,
    labelColor,
    tickColor,
    gridColor,
    chartTipBg,
    isLight,
    disableAnimation,
  ]);

  const cartesianOptions = useMemo(() => {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      ...(disableAnimation ? { animation: false as const } : {}),
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        title: {
          display: true,
          text: title,
          color: titleColor,
          font: { size: 11, weight: 600 },
          padding: { bottom: 6 },
        },
        legend: { display: false },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: chartTipBg,
          titleColor: isLight ? '#0f172a' : '#f1f5f9',
          bodyColor: isLight ? '#1e293b' : '#e2e8f0',
          borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx: { dataset: { label?: string }; parsed: { y: number | null } }) {
              const y = ctx.parsed.y;
              if (y == null || Number.isNaN(y)) return `${ctx.dataset.label ?? ''}: —`;
              // Display the AOI-pixel mean rounded to 3 decimals (value itself is unchanged).
              return `${ctx.dataset.label ?? ''}: ${y.toFixed(3)}`;
            },
          },
        },
        zoom: zoomCfg,
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, maxRotation: 40, minRotation: 0, font: { size: 9 } },
        },
        yIndex: {
          type: 'linear' as const,
          position: 'left' as const,
          display: effectiveDatasets.some(d => d.yAxisID === 'yIndex'),
          stacked: false,
          title: {
            display: true,
            text: 'Spectral index (−1 … 1)',
            color: labelColor,
            font: { size: 10, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 9 } },
          suggestedMin: -1,
          suggestedMax: 1,
        },
        yLST: {
          type: 'linear' as const,
          position: 'right' as const,
          display: hasLst && effectiveDatasets.some(d => d.yAxisID === 'yLST'),
          title: {
            display: true,
            text: 'LST (°C)',
            color: labelColor,
            font: { size: 10, weight: 600 },
          },
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor },
        },
      },
    };
    return base;
  }, [title, effectiveDatasets, hasLst, titleColor, labelColor, tickColor, gridColor, chartTipBg, isLight, zoomCfg, disableAnimation]);

  const lineOptions = useMemo(() => cartesianOptions as ChartOptions<'line'>, [cartesianOptions]);

  const barOptions = useMemo(() => cartesianOptions as ChartOptions<'bar'>, [cartesianOptions]);

  const pieOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...(disableAnimation ? { animation: false as const } : {}),
        plugins: {
          title: {
            display: true,
            text: `${title} · mean over AOI weeks`,
            color: titleColor,
            font: { size: 11, weight: 600 },
            padding: { bottom: 6 },
          },
          legend: { display: false },
          tooltip: {
            backgroundColor: chartTipBg,
            titleColor: isLight ? '#0f172a' : '#f1f5f9',
            bodyColor: isLight ? '#1e293b' : '#e2e8f0',
            borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx: { label?: string; parsed: number | null }) {
                const v = ctx.parsed;
                if (v == null || Number.isNaN(v)) return `${ctx.label ?? ''}: —`;
                return `${ctx.label ?? ''}: ${v.toFixed(3)}`;
              },
            },
          },
          zoom: zoomCfg,
        },
      }) as ChartOptions<'pie'>,
    [title, titleColor, labelColor, chartTipBg, isLight, zoomCfg, disableAnimation],
  );

  const exportChartToExcel = useCallback(() => {
    const primaryDs = datasets[0];
    downloadGeoAiIndexAnalyticalReportXlsx({
      chartTitle: title,
      labels,
      datasets: datasets.map(ds => ({
        id: ds.id,
        label: ds.label,
        data: ds.data,
        yAxisID: ds.yAxisID,
      })),
      exportLngLatPerRow,
      analytics: geoAiIndexAnalyticalExportContext,
      layerName: geoAiIndexAnalyticalExportContext?.layerName ?? primaryDs?.label ?? primaryDs?.id,
      aoiName: geoAiIndexAnalyticalExportContext?.aoiName ?? 'AOI',
    });
  }, [title, labels, datasets, exportLngLatPerRow, geoAiIndexAnalyticalExportContext]);

  const onGenerateReport = useCallback(() => {
    if (onRequestGenerateReport) {
      onRequestGenerateReport();
      return;
    }
    void appAlert(
      'Report generation is not connected to a backend yet. Use Export to Excel to download the multi-sheet GeoAI workbook (timeline + pixel analytics when an AOI polygon is loaded).',
      { title: 'Generate report' },
    );
  }, [onRequestGenerateReport]);

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

  if (!hasRealRasterData) {
    return (
      <div className="si-aoi-static-line-empty">
        <p className="si-aoi-static-line-empty-title">
          {rasterDataLoading ? 'Loading AOI raster samples…' : 'No raster data in AOI'}
        </p>
        <p className="si-aoi-static-line-empty-hint">
          {rasterDataLoading
            ? 'Sampling masked pixels inside your AOI for each timeline week via the analysis engine.'
            : 'Draw a polygon or circle AOI and use Generate timeline. Each index series uses live WMS / MPC pixel means per week — not shared preview curves.'}
        </p>
      </div>
    );
  }

  const chartKey = `${chartType}-${isLight ? 'light' : 'dark'}`;

  return (
    <div
      className={[
        'si-aoi-static-line-wrap',
        isLight ? 'si-aoi-static-line-wrap--light' : 'si-aoi-static-line-wrap--dark',
        isReport ? 'si-aoi-static-line-wrap--report' : '',
        chartType === 'scatter' ? 'si-aoi-static-line-wrap--scatter' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="si-aoi-static-line-toolbar">
        <div className="si-aoi-static-chart-type" role="group" aria-label="Chart type">
          <span className="si-aoi-static-chart-type-label">Chart type</span>
          <div className="si-aoi-static-chart-type-icons">
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'line' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Line chart"
              aria-pressed={chartType === 'line'}
              title="Line"
              onClick={() => setChartType('line')}
            >
              <i className="fa-solid fa-chart-line" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'bar' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Bar chart"
              aria-pressed={chartType === 'bar'}
              title="Bar"
              onClick={() => setChartType('bar')}
            >
              <i className="fa-solid fa-chart-column" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon si-aoi-static-chart-type-icon--scatter${chartType === 'scatter' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Scatter plot: compare two index layers (R²)"
              aria-pressed={chartType === 'scatter'}
              title="Scatter: compare two index layers · OLS & R²"
              onClick={() => setChartType('scatter')}
            >
              <span className="si-aoi-static-chart-type-icon__r2" aria-hidden>
                R<sup>2</sup>
              </span>
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'pie' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Pie chart"
              aria-pressed={chartType === 'pie'}
              title="Pie"
              onClick={() => setChartType('pie')}
            >
              <i className="fa-solid fa-chart-pie" aria-hidden />
            </button>
          </div>
        </div>
        {!isReport ? (
          <div className="si-aoi-static-line-actions">
            <button
              type="button"
              className="si-aoi-static-line-theme-toggle"
              aria-label={isLight ? 'Switch chart to dark theme' : 'Switch chart to light theme'}
              title={isLight ? 'Dark chart theme' : 'Light chart theme'}
              onClick={() => setChartTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
            >
              <i className={`fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
            </button>
            <button
              type="button"
              className="si-aoi-static-line-theme-toggle"
              aria-label="Generate report"
              title="Generate report"
              onClick={onGenerateReport}
            >
              <i className="fa-solid fa-file-lines" aria-hidden />
            </button>
            <button
              type="button"
              className="si-aoi-static-line-theme-toggle"
              aria-label="Export GeoAI Index Analytical Report to Excel"
              title="Export GeoSyntra workbook (.xlsx — Chart_Data, Data_Raw, Data_Classified, Summary_AOI, Class_Statistics, PG)"
              onClick={exportChartToExcel}
            >
              <i className="fa-regular fa-file-excel" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
      <div className="si-aoi-static-line-legend" role="list" aria-label="Indices and colors">
        {effectiveDatasets.map(ds => {
          const off = ds.hidden === true;
          const swatchHex = toColorInputValue(ds.borderColor);
          return (
            <div
              key={ds.id}
              className={`si-aoi-static-line-legend-item${off ? ' si-aoi-static-line-legend-item--off' : ''}`}
              role="listitem"
            >
              <button
                type="button"
                className="si-aoi-static-line-legend-toggle"
                onClick={() => toggleDatasetVisibility(ds.id)}
                aria-pressed={!off}
                title={off ? 'Show series' : 'Hide series (click)'}
              >
                <span className="si-aoi-static-line-legend-point" style={{ background: ds.borderColor }} aria-hidden />
                <span className="si-aoi-static-line-legend-label">{ds.label}</span>
              </button>
              <label className="si-aoi-static-line-legend-pick" title={`Color for ${ds.label}`}>
                <input
                  type="color"
                  className="si-aoi-static-line-legend-pick-input"
                  value={swatchHex}
                  onChange={e => setColorOverrides(c => ({ ...c, [ds.id]: e.target.value }))}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Pick color for ${ds.label}`}
                />
                <span className="si-aoi-static-line-legend-pick-icon" aria-hidden>
                  <i className="fa-solid fa-palette" />
                </span>
              </label>
            </div>
          );
        })}
      </div>
      <div className="si-aoi-static-line-chart-host">
        {chartType === 'line' ? (
          <Line key={chartKey} data={lineBarData} options={lineOptions} />
        ) : chartType === 'bar' ? (
          <Bar key={chartKey} data={lineBarData} options={barOptions} />
        ) : chartType === 'scatter' ? (
          scatterIndexCross?.data && scatterIndexCross.options ? (
            <Scatter key={chartKey} data={scatterIndexCross.data} options={scatterIndexCross.options} />
          ) : rasterDataLoading ? (
            <div className="si-aoi-static-scatter-empty">
              <p className="si-aoi-static-scatter-empty-title">
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Sampling index pixels…
              </p>
              <p className="si-aoi-static-scatter-empty-hint">
                Loading live WMS pixels for the active timeline week inside your AOI.
              </p>
            </div>
          ) : (
            <div className="si-aoi-static-scatter-empty">
              <p className="si-aoi-static-scatter-empty-title">Index scatter unavailable</p>
              <p className="si-aoi-static-scatter-empty-hint">
                Draw a polygon AOI, enable at least <strong>two index layers</strong> in the comparison chips, then
                open scatter again. Points are sampled from AOI interior pixels for the active timeline week.
              </p>
            </div>
          )
        ) : (
          <Pie key={chartKey} data={pieData} options={pieOptions} />
        )}
      </div>
      {chartType === 'scatter' && scatterIndexCross?.model ? (
        <ScatterRegressionStats model={scatterIndexCross.model} />
      ) : null}
    </div>
  );
}
