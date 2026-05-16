import { useCallback, useMemo, useState } from 'react';
import type { SiAoiDashboardMetrics, SiAoiIndexTableRow, SiAoiReportModel } from '../utils/siAoiVegetationReportModel';

type SortKey = keyof Pick<SiAoiIndexTableRow, 'label' | 'min' | 'max' | 'mean' | 'std' | 'status'>;

function statusClass(s: SiAoiIndexTableRow['status']): string {
  if (s === 'Healthy') return 'si-aoi-insights__status si-aoi-insights__status--ok';
  if (s === 'Moderate') return 'si-aoi-insights__status si-aoi-insights__status--mid';
  return 'si-aoi-insights__status si-aoi-insights__status--risk';
}

function downloadCsv(filename: string, rows: SiAoiIndexTableRow[]) {
  const head = ['Index', 'Min', 'Max', 'Mean', 'StdDev', 'Status'];
  const lines = [
    head.join(','),
    ...rows.map(r =>
      [r.label, r.min, r.max, r.mean, r.std, r.status]
        .map(c => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c)))
        .join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function SvgIndexBars({ series }: { series: SiAoiDashboardMetrics['barSeries'] }) {
  const w = 280;
  const h = 120;
  const pad = 16;
  const bw = (w - pad * 2) / Math.max(1, series.length) - 6;
  return (
    <svg className="si-aoi-insights__svg" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label="Index comparison bar chart">
      <rect x={0} y={0} width={w} height={h} fill="rgba(15,23,42,0.35)" rx={8} />
      {series.map((s, i) => {
        const x = pad + i * ((w - pad * 2) / series.length) + 3;
        const bh = (h - pad * 2) * s.valueNorm;
        const y = h - pad - bh;
        return <rect key={s.id} x={x} y={y} width={bw} height={bh} fill="#34d399" opacity={0.9} rx={3} />;
      })}
      {series.map((s, i) => {
        const cx = pad + i * ((w - pad * 2) / series.length) + 3 + bw / 2;
        return (
          <text key={`${s.id}-lbl`} x={cx} y={h - 4} textAnchor="middle" fill="#94a3b8" fontSize="9">
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}

function SvgLandPie({ slices }: { slices: SiAoiDashboardMetrics['pieSlices'] }) {
  const w = 200;
  const h = 200;
  const cx = w / 2;
  const cy = h / 2;
  const r = 72;
  let ang = -Math.PI / 2;
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1;
  const paths = slices.map((s, idx) => {
    const a0 = ang;
    const a1 = ang + (s.pct / total) * Math.PI * 2;
    ang = a1;
    const x1 = cx + r * Math.cos(a0);
    const y1 = cy + r * Math.sin(a0);
    const x2 = cx + r * Math.cos(a1);
    const y2 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return <path key={idx} d={d} fill={s.color} stroke="rgba(15,23,42,0.6)" strokeWidth={1} />;
  });
  return (
    <svg className="si-aoi-insights__svg" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label="Land cover distribution pie chart">
      <rect x={0} y={0} width={w} height={h} fill="rgba(15,23,42,0.35)" rx={8} />
      {paths}
    </svg>
  );
}

export type SiAoiReportDataInsightsSectionProps = {
  report: SiAoiReportModel;
  geminiSummary: string | null;
  geminiLoading: boolean;
  geminiError: string | null;
};

export function SiAoiReportDataInsightsSection({
  report,
  geminiSummary,
  geminiLoading,
  geminiError,
}: SiAoiReportDataInsightsSectionProps) {
  const di = report.dataInsights;
  const [sortKey, setSortKey] = useState<SortKey>('label');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedRows = useMemo(() => {
    const rows = [...di.indexRows];
    const mul = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === 'label' || sortKey === 'status') {
        return mul * String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      return mul * (Number(a[sortKey]) - Number(b[sortKey]));
    });
    return rows;
  }, [di.indexRows, sortKey, sortDir]);

  const toggleSort = useCallback((k: SortKey) => {
    setSortKey(prev => {
      if (prev === k) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return k;
    });
  }, []);

  const onCsv = useCallback(() => {
    downloadCsv(`aoi-index-stats-${report.aoiName.replace(/\s+/g, '-')}.csv`, sortedRows);
  }, [report.aoiName, sortedRows]);

  const fmt = (id: SiAoiIndexTableRow['indexId'], v: number) => (id === 'LST' ? v.toFixed(2) : v.toFixed(3));

  const d = di.dashboard;

  return (
    <div className="si-aoi-insights">
      <div className="si-aoi-insights__header">
        <h3 className="si-aoi-insights__title">Data &amp; insights</h3>
        <p className="si-aoi-insights__sub">
          Enterprise dashboard: AI executive view, multi-index statistics, and vector mini-charts (SVG). Values follow the
          same client-side engine as the report until zonal statistics are connected.
        </p>
      </div>

      <section className="si-aoi-insights__block" aria-labelledby="si-aoi-insights-exec">
        <h4 id="si-aoi-insights-exec" className="si-aoi-insights__block-title">
          1. Executive summary
        </h4>
        {geminiLoading ? <p className="si-aoi-insights__muted">Refining with Gemini… (baseline summary shown below)</p> : null}
        {geminiError ? <p className="si-aoi-insights__err">{geminiError}</p> : null}
        <p className="si-aoi-insights__exec">
          {geminiLoading
            ? report.summaryLinesEn.join(' ')
            : geminiSummary ?? report.summaryLinesEn.join(' ')}
        </p>
      </section>

      <section className="si-aoi-insights__block" aria-labelledby="si-aoi-insights-table">
        <div className="si-aoi-insights__table-head">
          <h4 id="si-aoi-insights-table" className="si-aoi-insights__block-title">
            2. Index data table
          </h4>
          <button type="button" className="si-aoi-insights__csv-btn" onClick={onCsv}>
            Export CSV
          </button>
        </div>
        <div className="si-aoi-insights__table-scroll">
          <table className="si-aoi-insights__table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('label')}>
                    Index {sortKey === 'label' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                </th>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('min')}>
                    Min
                  </button>
                </th>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('max')}>
                    Max
                  </button>
                </th>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('mean')}>
                    Mean
                  </button>
                </th>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('std')}>
                    Std dev
                  </button>
                </th>
                <th>
                  <button type="button" className="si-aoi-insights__th-btn" onClick={() => toggleSort('status')}>
                    Status
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr key={row.indexId}>
                  <td>{row.label}</td>
                  <td dir="ltr">{fmt(row.indexId, row.min)}</td>
                  <td dir="ltr">{fmt(row.indexId, row.max)}</td>
                  <td dir="ltr">{fmt(row.indexId, row.mean)}</td>
                  <td dir="ltr">{fmt(row.indexId, row.std)}</td>
                  <td>
                    <span className={statusClass(row.status)}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="si-aoi-insights__block" aria-labelledby="si-aoi-insights-dash">
        <h4 id="si-aoi-insights-dash" className="si-aoi-insights__block-title">
          3. AOI summary dashboard
        </h4>
        <div className="si-aoi-insights__kpi-grid">
          <div className="si-aoi-insights__kpi">
            <span className="si-aoi-insights__kpi-label">NDVI average</span>
            <span className="si-aoi-insights__kpi-val" dir="ltr">
              {d.ndviAvg.toFixed(3)}
            </span>
          </div>
          <div className="si-aoi-insights__kpi">
            <span className="si-aoi-insights__kpi-label">NDWI status</span>
            <span className="si-aoi-insights__kpi-val">{d.ndwiStatusLabel}</span>
          </div>
          <div className="si-aoi-insights__kpi">
            <span className="si-aoi-insights__kpi-label">Vegetation change</span>
            <span className="si-aoi-insights__kpi-val" dir="ltr">
              {d.vegChangePct >= 0 ? '+' : ''}
              {d.vegChangePct.toFixed(1)}%
            </span>
          </div>
          <div className="si-aoi-insights__kpi">
            <span className="si-aoi-insights__kpi-label">Heat risk</span>
            <span className="si-aoi-insights__kpi-val">{d.heatRiskLabel}</span>
          </div>
          <div className="si-aoi-insights__kpi">
            <span className="si-aoi-insights__kpi-label">Urban expansion (proxy)</span>
            <span className="si-aoi-insights__kpi-val" dir="ltr">
              {d.urbanExpansionPct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="si-aoi-insights__charts">
          <div className="si-aoi-insights__chart-cell">
            <span className="si-aoi-insights__chart-cap">Index comparison (bars, SVG)</span>
            <SvgIndexBars series={d.barSeries} />
          </div>
          <div className="si-aoi-insights__chart-cell">
            <span className="si-aoi-insights__chart-cap">Vigor distribution (pie, SVG)</span>
            <SvgLandPie slices={d.pieSlices} />
          </div>
        </div>
      </section>
    </div>
  );
}
