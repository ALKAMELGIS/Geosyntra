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
  /** One WGS84 point per timeline row for CSV export (inside AOI when provided). */
  exportLngLatPerRow?: AoiStaticExportLngLat[];
  /** Satellite Intelligence: open AOI vegetation report configuration. */
  onRequestGenerateReport?: () => void;
  /** When set with polygon AOI + weekly timeline, Excel export adds Data_Raw / Data_Classified / Summary / Class stats. */
  geoAiIndexAnalyticalExportContext?: SiGeoAiIndexAnalyticalExportContext | null;
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

function meanFinite(values: number[]): number {
  const xs = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function AoiStaticMultiLayerLineChart({
  title,
  labels,
  datasets,
  hasLst,
  exportLngLatPerRow,
  onRequestGenerateReport,
  geoAiIndexAnalyticalExportContext = null,
}: AoiStaticMultiLayerLineChartProps) {
  const [chartTheme, setChartTheme] = useState<'dark' | 'light'>('dark');
  const [chartType, setChartType] = useState<StaticChartType>('line');
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>(loadStoredIndexColors);
  const [hiddenById, setHiddenById] = useState<Record<string, boolean>>({});
  const isLight = chartTheme === 'light';
  const titleColor = isLight ? '#0f172a' : '#e2e8f0';
  const labelColor = isLight ? '#334155' : '#cbd5e1';
  const tickColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.14)';

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

  const scatterTimeSeriesData = useMemo(
    () => ({
      datasets: effectiveDatasets.map(ds => ({
        label: ds.label,
        data: labels.map((_, i) => {
          const y = ds.data[i];
          return { x: i, y: Number.isFinite(y) ? y : NaN };
        }),
        borderColor: ds.borderColor,
        backgroundColor: ds.backgroundColor,
        yAxisID: ds.yAxisID,
        pointRadius: 4,
        pointHoverRadius: 7,
        hidden: ds.hidden,
      })),
    }),
    [labels, effectiveDatasets],
  );

  /** First two visible comparison layers: X = layer A value, Y = layer B value per week (index vs index). */
  const scatterLayerCross = useMemo(() => {
    const vis = effectiveDatasets.filter(ds => !ds.hidden);
    if (vis.length < 2 || !labels.length) return null;
    const da = vis[0]!;
    const db = vis[1]!;
    const weekLabels: string[] = [];
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < labels.length; i++) {
      const x = da.data[i];
      const y = db.data[i];
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        pts.push({ x, y });
        weekLabels.push(labels[i] ?? '');
      }
    }
    if (!pts.length) return null;
    const xLst = da.yAxisID === 'yLST';
    const yLst = db.yAxisID === 'yLST';
    const data = {
      datasets: [
        {
          label: `${db.label} vs ${da.label}`,
          data: pts,
          borderColor: db.borderColor,
          backgroundColor: db.backgroundColor || `${db.borderColor}44`,
          pointRadius: 5,
          pointHoverRadius: 8,
        },
      ],
    };
    const tipBg = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.92)';
    const zoomCross = {
      pan: { enabled: true, mode: 'xy' as const },
      limits: { x: { minRange: 0.02 }, y: { minRange: 0.02 } },
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' as const },
    };
    const options: ChartOptions<'scatter'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        title: {
          display: true,
          text: `${title} · scatter: ${db.label} vs ${da.label} (by week)`,
          color: titleColor,
          font: { size: 12, weight: 600 },
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
          callbacks: {
            title(items: Array<{ dataIndex?: number }>) {
              const ix = items[0]?.dataIndex;
              return ix != null && weekLabels[ix!] != null ? String(weekLabels[ix!]) : '';
            },
            label(ctx: { parsed: { x: number; y: number } }) {
              return [`${da.label}: ${ctx.parsed.x}`, `${db.label}: ${ctx.parsed.y}`];
            },
          },
        },
        zoom: zoomCross,
      },
      scales: {
        x: {
          type: 'linear' as const,
          display: true,
          title: {
            display: true,
            text: `${da.label}${xLst ? ' (°C)' : ''}`,
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor },
          ...(xLst ? { suggestedMin: 10, suggestedMax: 50 } : { suggestedMin: -1, suggestedMax: 1 }),
        },
        y: {
          type: 'linear' as const,
          display: true,
          title: {
            display: true,
            text: `${db.label}${yLst ? ' (°C)' : ''}`,
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor },
          ...(yLst ? { suggestedMin: 10, suggestedMax: 50 } : { suggestedMin: -1, suggestedMax: 1 }),
        },
      },
    };
    return { data, options };
  }, [effectiveDatasets, labels, title, titleColor, labelColor, tickColor, gridColor, isLight]);

  const cartesianOptions = useMemo(() => {
    const base = {
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
        legend: { display: false },
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
        zoom: zoomCfg,
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, maxRotation: 40, minRotation: 0, font: { size: 10 } },
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
          display: hasLst && effectiveDatasets.some(d => d.yAxisID === 'yLST'),
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
    };
    return base;
  }, [title, effectiveDatasets, hasLst, titleColor, labelColor, tickColor, gridColor, isLight, zoomCfg]);

  const lineOptions = useMemo(() => cartesianOptions as ChartOptions<'line'>, [cartesianOptions]);

  const barOptions = useMemo(() => cartesianOptions as ChartOptions<'bar'>, [cartesianOptions]);

  const scatterOptions = useMemo(() => {
    const xMax = Math.max(labels.length - 1, 0);
    const tt = cartesianOptions.plugins?.tooltip;
    return {
      ...cartesianOptions,
      interaction: { mode: 'nearest' as const, intersect: false },
      scales: {
        ...cartesianOptions.scales,
        x: {
          type: 'linear' as const,
          min: -0.35,
          max: xMax + 0.35,
          grid: { color: gridColor },
          title: {
            display: true,
            text: 'Week',
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          ticks: {
            color: tickColor,
            maxTicksLimit: 10,
            callback(tickValue: string | number) {
              const idx = Math.round(Number(tickValue));
              if (idx >= 0 && idx < labels.length) return labels[idx];
              return '';
            },
          },
        },
      },
      plugins: {
        ...cartesianOptions.plugins,
        tooltip: {
          ...tt,
          mode: 'nearest' as const,
          intersect: false,
          callbacks: {
            ...tt?.callbacks,
            label(ctx: { dataset: { label?: string }; parsed: { x?: number; y: number | null } }) {
              const i = Math.round(Number(ctx.parsed.x ?? NaN));
              const date = i >= 0 && i < labels.length ? labels[i] : '';
              const y = ctx.parsed.y;
              if (y == null || Number.isNaN(y)) return `${ctx.dataset.label ?? ''}${date ? ` (${date})` : ''}: —`;
              return `${ctx.dataset.label ?? ''}${date ? ` (${date})` : ''}: ${y}`;
            },
          },
        },
      },
    } as ChartOptions<'scatter'>;
  }, [cartesianOptions, labels, gridColor, labelColor, tickColor]);

  const pieOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${title} · mean over AOI weeks`,
            color: titleColor,
            font: { size: 12, weight: 600 },
            padding: { bottom: 8 },
          },
          legend: { display: false },
          tooltip: {
            backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.92)',
            titleColor: isLight ? '#0f172a' : '#f1f5f9',
            bodyColor: isLight ? '#1e293b' : '#e2e8f0',
            borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
            borderWidth: 1,
            padding: 10,
          },
          zoom: zoomCfg,
        },
      }) as ChartOptions<'pie'>,
    [title, titleColor, labelColor, isLight, zoomCfg],
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

  const chartKey = `${chartType}-${isLight ? 'light' : 'dark'}`;

  return (
    <div className={`si-aoi-static-line-wrap ${isLight ? 'si-aoi-static-line-wrap--light' : 'si-aoi-static-line-wrap--dark'}`}>
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
              className={`si-aoi-static-chart-type-icon${chartType === 'scatter' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Scatter plot: compare two index layers"
              aria-pressed={chartType === 'scatter'}
              title="Scatter (1st vs 2nd layer chip, by week)"
              onClick={() => setChartType('scatter')}
            >
              <i className="fa-solid fa-chart-scatter" aria-hidden />
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
          <Scatter
            key={chartKey}
            data={scatterLayerCross ? scatterLayerCross.data : scatterTimeSeriesData}
            options={scatterLayerCross ? scatterLayerCross.options : scatterOptions}
          />
        ) : (
          <Pie key={chartKey} data={pieData} options={pieOptions} />
        )}
      </div>
    </div>
  );
}
