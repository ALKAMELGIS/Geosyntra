import { useMemo } from 'react';
import type { SiAoiReportModel } from '../utils/siAoiVegetationReportModel';
import { buildAgHealthPieSlices } from '../utils/siCropGrowthStage';
import {
  formatTimelineAxisDate,
  pickTimelineLabelIndices,
  svgDonutSlicePath,
} from '../utils/siAoiReportInfographicCharts';

function SvgAgHealthDoughnut({ slices }: { slices: ReturnType<typeof buildAgHealthPieSlices> }) {
  const w = 120;
  const h = 120;
  const cx = w / 2;
  const cy = h / 2;
  const outerR = 48;
  const innerR = 28;
  const total = slices.reduce((a, s) => a + s.pct, 0) || 1;
  let ang = -Math.PI / 2;

  const paths = slices.map((s, idx) => {
    const a0 = ang;
    const a1 = ang + (s.pct / total) * Math.PI * 2;
    ang = a1;
    return (
      <path
        key={idx}
        d={svgDonutSlicePath(cx, cy, outerR, innerR, a0, a1)}
        fill={s.color}
        stroke="#fff"
        strokeWidth={1.2}
      />
    );
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-label="AOI health distribution doughnut chart">
      {paths}
    </svg>
  );
}

function SvgCompactTimeline({ report }: { report: SiAoiReportModel }) {
  const pts = report.timeSeries.filter(p => Number.isFinite(p.value));
  const w = 480;
  const h = 112;
  const padL = 40;
  const padR = 12;
  const padT = 14;
  const padB = 32;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const pathD = useMemo(() => {
    if (pts.length < 2) return '';
    const vals = pts.map(p => p.value);
    let vMin = Math.min(...vals);
    let vMax = Math.max(...vals);
    const pad = Math.max(1e-6, (vMax - vMin) * 0.12);
    vMin -= pad;
    vMax += pad;
    const span = Math.max(1e-6, vMax - vMin);
    const px = (i: number) => padL + (i / (pts.length - 1)) * innerW;
    const py = (v: number) => padT + innerH - ((v - vMin) / span) * innerH;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(p.value)}`).join(' ');
  }, [pts, innerH, innerW]);

  const labelIndices = useMemo(() => pickTimelineLabelIndices(pts.length, 8), [pts.length]);

  if (pts.length < 2) {
    return (
      <p className="si-aoi-report-infographic__empty">Timeline needs at least two dates in the study period.</p>
    );
  }

  const accent = '#15803d';
  const vals = pts.map(p => p.value);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const pad = Math.max(1e-6, (vMax - vMin) * 0.12);
  vMin -= pad;
  vMax += pad;
  const span = Math.max(1e-6, vMax - vMin);
  const px = (i: number) => padL + (i / (pts.length - 1)) * innerW;
  const py = (v: number) => padT + innerH - ((v - vMin) / span) * innerH;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-label={`${report.indexLabel} timeline`}>
      {[0, 1, 2, 3].map(g => {
        const yy = padT + (innerH * g) / 3;
        return <line key={g} x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="rgba(148,163,184,0.15)" strokeWidth={1} />;
      })}
      <path d={pathD} fill="none" stroke={accent} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.value)} r={3} fill={accent} />
      ))}
      {labelIndices.map(idx => (
        <text
          key={idx}
          x={px(idx)}
          y={h - 8}
          textAnchor={idx === 0 ? 'start' : idx === pts.length - 1 ? 'end' : 'middle'}
          fill="#94a3b8"
          fontSize={9}
        >
          {formatTimelineAxisDate(pts[idx]!.date)}
        </text>
      ))}
    </svg>
  );
}

function AgHealthColorKey({ slices }: { slices: ReturnType<typeof buildAgHealthPieSlices> }) {
  return (
    <ul className="si-aoi-report-infographic__legend" role="list">
      {slices.map(s => (
        <li key={s.label}>
          <span className="si-aoi-report-infographic__swatch" style={{ background: s.color }} aria-hidden />
          <span className="si-aoi-report-infographic__lbl">{s.label}</span>
          <span className="si-aoi-report-infographic__pct" dir="ltr">
            {s.pct.toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export type SiAoiReportInfographicPanelProps = {
  report: SiAoiReportModel;
};

export function SiAoiReportInfographicPanel({ report }: SiAoiReportInfographicPanelProps) {
  const slices = useMemo(() => buildAgHealthPieSlices(report), [report]);

  return (
    <div className="si-aoi-report-infographic">
      <div className="si-aoi-report-infographic__block si-aoi-report-infographic__block--page1-end">
        <h4>AOI health distribution</h4>
        <p className="si-aoi-report-infographic__lead">
          Share of the AOI by crop condition ({report.dateStart} – {report.dateEnd}).
        </p>
        <div className="si-aoi-report-infographic__pie-row">
          <div className="si-aoi-report-infographic__donut-wrap">
            <SvgAgHealthDoughnut slices={slices} />
          </div>
          <AgHealthColorKey slices={slices} />
        </div>

        <div className="si-aoi-report-infographic__timeline-foot">
          <h4>{report.indexLabel} timeline</h4>
          <p className="si-aoi-report-infographic__lead">
            Spectral trend across the study period ({report.dateStart} – {report.dateEnd}).
          </p>
          <SvgCompactTimeline report={report} />
        </div>
      </div>
    </div>
  );
}
