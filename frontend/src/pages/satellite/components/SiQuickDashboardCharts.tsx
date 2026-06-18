import type { SiQuickDashboardTheme } from '../utils/siQuickDashboardTheme';
import type { SiQuickDashboardWidget } from '../utils/siQuickDashboardEngine';
import type { SiQuickCrossFilter } from '../utils/siQuickDashboardCrossFilter';
import type { CSSProperties } from 'react';

export type SiQuickChartFilterHandlers = {
  crossFilter: SiQuickCrossFilter;
  onCategorySelect: (field: string, value: string, widgetId: string) => void;
  onRangeSelect: (field: string, from: string, to: string, widgetId: string) => void;
};

function isSelected(
  handlers: SiQuickChartFilterHandlers,
  field: string,
  value: string,
): boolean {
  return (
    handlers.crossFilter?.type === 'equals' &&
    handlers.crossFilter.field === field &&
    handlers.crossFilter.value === value
  );
}

function isRangeSelected(
  handlers: SiQuickChartFilterHandlers,
  field: string,
  label: string,
): boolean {
  return (
    handlers.crossFilter?.type === 'range' &&
    handlers.crossFilter.field === field &&
    handlers.crossFilter.from === label &&
    handlers.crossFilter.to === label
  );
}

export function GaugeWidget({
  value,
  max,
  label,
  theme,
}: {
  value: number;
  max: number;
  label: string;
  theme: SiQuickDashboardTheme;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="si-qdash-gauge" role="img" aria-label={label}>
      <div
        className="si-qdash-gauge__arc"
        style={{
          background: `conic-gradient(${theme.accent} ${pct * 3.6}deg, rgba(15,23,42,0.06) 0)`,
        }}
      />
      <span className="si-qdash-gauge__val" dir="ltr">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function niceAxisMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / pow;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * pow;
}

function buildYTicks(max: number, count = 4): number[] {
  if (count < 2) return [0, max];
  return Array.from({ length: count }, (_, i) => {
    const v = (max * i) / (count - 1);
    if (v === 0) return 0;
    if (Math.abs(v) >= 1000) return Math.round(v);
    return Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  });
}

function compactAxisTick(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function truncateLabel(label: string, max = 11): string {
  const s = label.trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Keep SVG/text pixel size stable when the floating card is resized. */
function fixedSvgSize(w: number, h: number) {
  return {
    width: w,
    height: h,
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: 'xMinYMin meet' as const,
    style: {
      width: w,
      height: h,
      minWidth: w,
      maxWidth: w,
      minHeight: h,
      maxHeight: h,
      flexShrink: 0,
    } as CSSProperties,
  };
}

export function BarChart({
  series,
  field,
  widgetId,
  theme,
  handlers,
}: {
  series: { label: string; value: number }[];
  field: string;
  widgetId: string;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  const data = series.slice(0, 8);
  if (!data.length) return null;

  const maxVal = Math.max(...data.map(s => s.value), 1);
  const yMax = niceAxisMax(maxVal);
  const yTicks = buildYTicks(yMax);

  const slotW = 42;
  const chartH = 108;
  const W = Math.max(220, data.length * slotW + 38);
  const H = chartH;
  const padL = 30;
  const padR = 8;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const barW = Math.min(22, slotW * 0.52);
  const gradPrefix = `si-qdash-bar-${widgetId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div className="si-qdash-col-chart-block">
      <div className="si-qdash-col-chart-scroll" role="list">
        <svg
          className="si-qdash-col-chart si-qdash-chart-fixed"
          {...fixedSvgSize(W, H)}
          role="img"
          aria-label="Column chart"
        >
          <defs>
            {data.map((_, i) => {
              const base = theme.chartColors[i % theme.chartColors.length]!;
              return (
                <linearGradient key={i} id={`${gradPrefix}-${i}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={base} stopOpacity="0.72" />
                  <stop offset="100%" stopColor={base} stopOpacity="1" />
                </linearGradient>
              );
            })}
          </defs>

          {yTicks.map(tick => {
            const y = padT + plotH - (tick / yMax) * plotH;
            return (
              <g key={tick}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} className="si-qdash-col-grid" />
                <text
                  x={padL - 5}
                  y={y + 2.5}
                  className="si-qdash-col-y-label"
                  textAnchor="end"
                  fontSize="7"
                >
                  {compactAxisTick(tick)}
                </text>
              </g>
            );
          })}

          <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} className="si-qdash-col-axis" />

          {data.map((s, i) => {
            const cx = padL + slotW * i + slotW / 2 + (plotW - data.length * slotW) / 2;
            const barH = Math.max(3, (s.value / yMax) * plotH);
            const x = cx - barW / 2;
            const y = padT + plotH - barH;
            const color = theme.chartColors[i % theme.chartColors.length]!;
            const active = handlers ? isSelected(handlers, field, s.label) : false;
            return (
              <g
                key={s.label}
                role="listitem"
                className={'si-qdash-col-group' + (active ? ' si-qdash-col-group--active' : '')}
                onClick={() => handlers?.onCategorySelect(field, s.label, widgetId)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlers?.onCategorySelect(field, s.label, widgetId);
                  }
                }}
                tabIndex={handlers ? 0 : undefined}
                style={{ cursor: handlers ? 'pointer' : undefined }}
              >
                <rect
                  className="si-qdash-col-bar"
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={4}
                  ry={4}
                  fill={`url(#${gradPrefix}-${i})`}
                  stroke={active ? color : 'transparent'}
                  strokeWidth={active ? 1.5 : 0}
                />
                {barH > 12 ? (
                  <text
                    x={cx}
                    y={y + 9}
                    className="si-qdash-col-data-label si-qdash-col-data-label--inbar"
                    textAnchor="middle"
                    fontSize="6.5"
                    fill="#fff"
                  >
                    {s.value}
                  </text>
                ) : (
                  <text
                    x={cx}
                    y={y - 4}
                    className="si-qdash-col-data-label"
                    textAnchor="middle"
                    fontSize="6.5"
                  >
                    {s.value}
                  </text>
                )}
                <title>{`${s.label}: ${s.value}`}</title>
                <text x={cx} y={H - 7} className="si-qdash-col-x-label" textAnchor="middle" fontSize="6.5">
                  {truncateLabel(s.label, 9)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="si-qdash-col-legend" aria-hidden>
        {data.slice(0, 6).map((s, i) => (
          <li key={s.label}>
            <span
              className="si-qdash-col-legend-dot"
              style={{ background: theme.chartColors[i % theme.chartColors.length] }}
            />
            <span className="si-qdash-col-legend-lbl">{truncateLabel(s.label, 14)}</span>
            <span className="si-qdash-col-legend-val" dir="ltr">
              {s.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DonutChart({
  buckets,
  field,
  widgetId,
  theme,
  handlers,
}: {
  buckets: { label: string; count: number; pct: number }[];
  field: string;
  widgetId: string;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  let offset = 0;
  const stops = buckets.map((b, i) => {
    const start = offset;
    offset += b.pct;
    return `${theme.chartColors[i % theme.chartColors.length]} ${start}% ${offset}%`;
  });
  return (
    <div className="si-qdash-pie-wrap si-qdash-pie-wrap--donut">
      <div
        className="si-qdash-pie si-qdash-pie--donut"
        style={{ background: stops.length ? `conic-gradient(${stops.join(', ')})` : '#334155' }}
        role="img"
        aria-label="Category distribution"
      />
      <ul className="si-qdash-pie-legend">
        {buckets.map((b, i) => {
          const active = handlers ? isSelected(handlers, field, b.label) : false;
          return (
            <li key={b.label}>
              <button
                type="button"
                className={'si-qdash-pie-btn' + (active ? ' si-qdash-pie-btn--active' : '')}
                onClick={() => handlers?.onCategorySelect(field, b.label, widgetId)}
              >
                <span
                  className="si-qdash-pie-dot"
                  style={{ background: theme.chartColors[i % theme.chartColors.length] }}
                  aria-hidden
                />
                <span className="si-qdash-pie-lbl">{b.label}</span>
                <span className="si-qdash-pie-pct" dir="ltr">
                  {b.pct.toFixed(0)}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AreaChart({
  series,
  field,
  widgetId,
  theme,
  handlers,
}: {
  series: { label: string; value: number }[];
  field: string;
  widgetId: string;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  const w = 300;
  const h = 88;
  const max = Math.max(...series.map(s => s.value), 1);
  const pts = series.map((s, i) => {
    const x = series.length <= 1 ? w / 2 : (i / (series.length - 1)) * w;
    const y = h - (s.value / max) * (h - 10) - 5;
    return { x, y, label: s.label };
  });
  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPts = `0,${h} ${linePts} ${w},${h}`;
  const gradId = `si-qdash-area-${widgetId}`;

  return (
    <div className="si-qdash-area-wrap si-qdash-chart-fixed-wrap">
      <svg
        className="si-qdash-line si-qdash-area si-qdash-chart-fixed"
        {...fixedSvgSize(w, h)}
        role="img"
        aria-label="Time series"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={theme.accent2} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${gradId}-line`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={theme.accent} />
            <stop offset="100%" stopColor={theme.accent2} />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill={`url(#${gradId})`} />
        <polyline points={linePts} fill="none" stroke={`url(#${gradId}-line)`} strokeWidth="2.5" />
        {pts.map(p => (
          <circle
            key={p.label}
            cx={p.x}
            cy={p.y}
            r={handlers ? 5 : 3}
            fill={theme.accent}
            className={handlers ? 'si-qdash-area-dot' : undefined}
            onClick={
              handlers
                ? () => handlers.onRangeSelect(field, p.label, p.label, widgetId)
                : undefined
            }
          />
        ))}
      </svg>
      <div className="si-qdash-area-labels">
        {series.slice(0, 6).map(s => {
          const active = handlers ? isRangeSelected(handlers, field, s.label) : false;
          return (
            <button
              key={s.label}
              type="button"
              className={'si-qdash-area-lbl' + (active ? ' si-qdash-area-lbl--active' : '')}
              onClick={() => handlers?.onRangeSelect(field, s.label, s.label, widgetId)}
              dir="ltr"
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TreemapChart({
  nodes,
  field,
  widgetId,
  theme,
  handlers,
}: {
  nodes: { label: string; value: number }[];
  field: string;
  widgetId: string;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  const total = nodes.reduce((s, n) => s + n.value, 0) || 1;
  return (
    <div className="si-qdash-treemap">
      {nodes.slice(0, 8).map((n, i) => {
        const pct = (n.value / total) * 100;
        const active = handlers ? isSelected(handlers, field, n.label) : false;
        return (
          <button
            key={n.label}
            type="button"
            className={'si-qdash-treemap-cell' + (active ? ' si-qdash-treemap-cell--active' : '')}
            style={{
              flexGrow: Math.max(1, n.value),
              background: `linear-gradient(145deg, ${theme.chartColors[i % theme.chartColors.length]}33, rgba(0,0,0,0.35))`,
              borderColor: `${theme.chartColors[i % theme.chartColors.length]}66`,
            }}
            onClick={() => handlers?.onCategorySelect(field, n.label, widgetId)}
            title={`${n.label}: ${n.value}`}
          >
            <span className="si-qdash-treemap-lbl">{n.label}</span>
            <span className="si-qdash-treemap-v" dir="ltr">
              {pct.toFixed(0)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HeatmapChart({
  cells,
  field,
  filterField,
  widgetId,
  theme,
  handlers,
}: {
  cells: { x: string; y: string; value: number }[];
  field: string;
  filterField?: string;
  widgetId: string;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  const max = Math.max(...cells.map(c => c.value), 1);
  const xs = [...new Set(cells.map(c => c.x))].slice(0, 6);
  const ys = [...new Set(cells.map(c => c.y))].slice(0, 6);
  return (
    <div className="si-qdash-heatmap">
      <div className="si-qdash-heatmap-grid" style={{ gridTemplateColumns: `repeat(${xs.length}, 1fr)` }}>
        {xs.flatMap(x =>
          ys.map(y => {
            const cell = cells.find(c => c.x === x && c.y === y);
            const v = cell?.value ?? 0;
            const intensity = v / max;
            const active = handlers && cell ? isSelected(handlers, field, x) : false;
            return (
              <button
                key={`${x}-${y}`}
                type="button"
                className={'si-qdash-heatmap-cell' + (active ? ' si-qdash-heatmap-cell--active' : '')}
                style={{
                  background: `linear-gradient(160deg, ${theme.accent}${Math.round(intensity * 180)
                    .toString(16)
                    .padStart(2, '0')}, rgba(0,0,0,0.2))`,
                }}
                title={`${x} × ${y}: ${v}`}
                onClick={() => {
                  if (!handlers || !cell) return;
                  handlers.onCategorySelect(field, x, widgetId);
                }}
              >
                <span dir="ltr">{v || '·'}</span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

export function ScatterChart({
  points,
  theme,
}: {
  points: { x: number; y: number; label?: string }[];
  theme: SiQuickDashboardTheme;
}) {
  const w = 280;
  const h = 100;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return (
    <svg
      className="si-qdash-scatter si-qdash-chart-fixed"
      {...fixedSvgSize(w, h)}
      role="img"
      aria-label="Scatter plot"
    >
      {points.map((p, i) => {
        const cx = ((p.x - minX) / spanX) * (w - 16) + 8;
        const cy = h - ((p.y - minY) / spanY) * (h - 16) - 8;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={3.5}
            fill={theme.chartColors[i % theme.chartColors.length]}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

export function WidgetBodyPro({
  widget,
  theme,
  handlers,
}: {
  widget: SiQuickDashboardWidget;
  theme: SiQuickDashboardTheme;
  handlers?: SiQuickChartFilterHandlers;
}) {
  if (widget.numeric) {
    const n = widget.numeric;
    return (
      <div className="si-qdash-widget-numeric">
        <div className="si-qdash-stat-row">
          <span className="si-qdash-stat-chip si-qdash-stat-chip--sum">
            Sum <strong dir="ltr">{n.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          </span>
          <span className="si-qdash-stat-chip">
            Avg <strong dir="ltr">{n.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          </span>
          <span className="si-qdash-stat-chip">
            Range{' '}
            <strong dir="ltr">
              {n.min.toLocaleString()}–{n.max.toLocaleString()}
            </strong>
          </span>
          {widget.outlierCount ? (
            <span className="si-qdash-outlier-badge">{widget.outlierCount} outliers</span>
          ) : null}
        </div>
        {widget.series?.length ? (
          <BarChart
            series={widget.series}
            field={widget.field}
            widgetId={widget.id}
            theme={theme}
            handlers={handlers}
          />
        ) : null}
      </div>
    );
  }

  if ((widget.kind === 'area' || widget.kind === 'line') && widget.series?.length) {
    return (
      <AreaChart
        series={widget.series}
        field={widget.field}
        widgetId={widget.id}
        theme={theme}
        handlers={handlers}
      />
    );
  }

  if ((widget.kind === 'donut' || widget.kind === 'pie') && widget.categories?.length) {
    return (
      <DonutChart
        buckets={widget.categories}
        field={widget.field}
        widgetId={widget.id}
        theme={theme}
        handlers={handlers}
      />
    );
  }

  if (widget.kind === 'treemap' && widget.treemap?.length) {
    return (
      <TreemapChart
        nodes={widget.treemap}
        field={widget.field}
        widgetId={widget.id}
        theme={theme}
        handlers={handlers}
      />
    );
  }

  if (widget.kind === 'heatmap' && widget.heatmap?.length) {
    return (
      <HeatmapChart
        cells={widget.heatmap}
        field={widget.field}
        filterField={widget.filterField}
        widgetId={widget.id}
        theme={theme}
        handlers={handlers}
      />
    );
  }

  if (widget.kind === 'scatter' && widget.scatter?.length) {
    return <ScatterChart points={widget.scatter} theme={theme} />;
  }

  if (widget.categories?.length) {
    return (
      <BarChart
        series={widget.categories.map(c => ({ label: c.label, value: c.count }))}
        field={widget.field}
        widgetId={widget.id}
        theme={theme}
        handlers={handlers}
      />
    );
  }

  if (widget.tableRows?.length) {
    return (
      <table className="si-qdash-table">
        <tbody>
          {widget.tableRows.map(r => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td dir="ltr">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}

export function chartKindLabel(kind: string, lang?: string): string {
  const en: Record<string, string> = {
    bar: 'Bar',
    stackedBar: 'Stacked',
    pie: 'Pie',
    donut: 'Donut',
    line: 'Line',
    area: 'Time series',
    gauge: 'Gauge',
    heatmap: 'Heatmap',
    treemap: 'Treemap',
    scatter: 'Scatter',
    table: 'Table',
  };
  const ar: Record<string, string> = {
    bar: 'أعمدة',
    stackedBar: 'مكدّس',
    pie: 'دائري',
    donut: 'حلقي',
    line: 'خطّي',
    area: 'سلسلة زمنية',
    gauge: 'مقياس',
    heatmap: 'خريطة حرارية',
    treemap: 'شجرة',
    scatter: 'انتشار',
    table: 'جدول',
  };
  const map = lang === 'ar' ? ar : en;
  return map[kind] ?? kind;
}
