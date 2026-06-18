import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiElevationProfileSample, SiElevationProfileStats, SiElevationProfileUnit } from '../utils/siMapElevationProfile';
import {
  displayDistance,
  distanceUnitLabel,
  elevUnitLabel,
  metersToDisplayElev,
} from '../utils/siMapElevationProfile';
import type { SiElevProfileDockTheme } from '../utils/siMapElevationProfileDockTheme';
import './SiMapElevationProfileChart.css';

export type SiMapElevationProfileChartProps = {
  samples: SiElevationProfileSample[];
  stats: SiElevationProfileStats | null;
  unit: SiElevationProfileUnit;
  activeIndex: number;
  onActiveIndexChange: (idx: number) => void;
  theme?: SiElevProfileDockTheme;
};

export function SiMapElevationProfileChart({
  samples,
  stats,
  unit,
  activeIndex,
  onActiveIndexChange,
  theme = 'dark',
}: SiMapElevationProfileChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(420);
  const [height, setHeight] = useState(150);

  const syncSize = useCallback(() => {
    const el = plotRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const hh = el.clientHeight;
    if (w > 80) setWidth(w);
    if (hh > 60) setHeight(hh);
  }, []);

  // Track the plot area so the SVG fills it on drag-resize / responsive layout (no letterboxing).
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncSize]);

  const h = height;
  const padL = 42;
  const padR = 12;
  const padT = 10;
  const padB = 26;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(30, h - padT - padB);

  if (!samples.length) return null;

  const minE = Math.min(...samples.map(s => metersToDisplayElev(s.elevationM, unit)));
  const maxE = Math.max(...samples.map(s => metersToDisplayElev(s.elevationM, unit)));
  const maxD = displayDistance(samples[samples.length - 1]?.distanceM ?? 1, unit);
  const rangeE = Math.max(1, maxE - minE);

  const points = samples.map((s, i) => {
    const x = padL + (displayDistance(s.distanceM, unit) / maxD) * plotW;
    const y = padT + plotH - ((metersToDisplayElev(s.elevationM, unit) - minE) / rangeE) * plotH;
    return { x, y, i };
  });

  const areaPath =
    points.length > 0
      ? `M ${points[0].x} ${padT + plotH} ` +
        points.map(p => `L ${p.x} ${p.y}`).join(' ') +
        ` L ${points[points.length - 1].x} ${padT + plotH} Z`
      : '';

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const active =
    activeIndex >= 0 && activeIndex < samples.length ? samples[activeIndex] : samples[0];
  const activePt = points[Math.min(Math.max(0, activeIndex), points.length - 1)] ?? points[0];

  const pickIndex = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - x);
      if (d < bestD) {
        bestD = d;
        best = p.i;
      }
    }
    onActiveIndexChange(best);
  };

  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minE + (rangeE * i) / yTicks);

  const themeClass = theme === 'light' ? ' si-elev-profile-chart--light' : '';

  return (
    <div className={`si-elev-profile-chart${themeClass}`} ref={wrapRef}>
      <div
        ref={plotRef}
        className="si-elev-profile-chart__plot-wrap"
        onPointerDown={e => {
          syncSize();
          pickIndex(e.clientX);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) pickIndex(e.clientX);
        }}
        onPointerUp={e => {
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
      >
        <svg
          className="si-elev-profile-chart__svg"
          viewBox={`0 0 ${width} ${h}`}
          role="img"
          aria-label="Elevation profile chart"
          onMouseMove={e => pickIndex(e.clientX)}
        >
          <defs>
            <linearGradient id="si-elev-profile-fill" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.85" />
              <stop offset="55%" stopColor="#2563eb" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {yTickVals.map((v, i) => {
            const y = padT + plotH - ((v - minE) / rangeE) * plotH;
            return (
              <g key={i}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y}
                  y2={y}
                  className="si-elev-profile-chart__grid"
                />
                <text x={padL - 6} y={y + 4} textAnchor="end" className="si-elev-profile-chart__axis">
                  {Math.round(v).toLocaleString()}
                </text>
              </g>
            );
          })}
          <text x={padL - 32} y={padT + plotH / 2} className="si-elev-profile-chart__axis-title" transform={`rotate(-90, ${padL - 32}, ${padT + plotH / 2})`}>
            Elevation ({elevUnitLabel(unit)})
          </text>
          <path d={areaPath} fill="url(#si-elev-profile-fill)" stroke="none" />
          <path d={linePath} className="si-elev-profile-chart__line" />
          {activePt ? (
            <>
              <line
                x1={activePt.x}
                x2={activePt.x}
                y1={padT}
                y2={padT + plotH}
                className="si-elev-profile-chart__cursor"
              />
              <circle cx={activePt.x} cy={activePt.y} r={5} className="si-elev-profile-chart__dot" />
            </>
          ) : null}
          <text x={padL + plotW / 2} y={h - 6} textAnchor="middle" className="si-elev-profile-chart__axis">
            Distance ({distanceUnitLabel(unit)}) — {Math.round(maxD).toLocaleString()} {distanceUnitLabel(unit)} total
          </text>
        </svg>
        {active ? (
          <div
            className="si-elev-profile-chart__tooltip"
            style={{
              left: `${Math.min(92, Math.max(8, ((activePt?.x ?? padL) / width) * 100))}%`,
            }}
          >
            <span>{Math.round(displayDistance(active.distanceM, unit)).toLocaleString()} {distanceUnitLabel(unit)}</span>
            <strong>
              {Math.round(metersToDisplayElev(active.elevationM, unit)).toLocaleString()} {elevUnitLabel(unit)}
            </strong>
            <span>{active.gradePct.toFixed(2)}%</span>
          </div>
        ) : null}
      </div>
      {stats ? (
        <footer className="si-elev-profile-chart__stats" aria-label={`Elevation statistics in ${elevUnitLabel(unit)}`}>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Min</span>
            <span className="si-elev-profile-chart__stat-value">
              {Math.round(metersToDisplayElev(stats.minM, unit)).toLocaleString()}
            </span>
          </div>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Avg</span>
            <span className="si-elev-profile-chart__stat-value">
              {Math.round(metersToDisplayElev(stats.avgM, unit)).toLocaleString()}
            </span>
          </div>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Max</span>
            <span className="si-elev-profile-chart__stat-value">
              {Math.round(metersToDisplayElev(stats.maxM, unit)).toLocaleString()}
            </span>
          </div>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Gain</span>
            <span className="si-elev-profile-chart__stat-value si-elev-profile-chart__stat-value--gain">
              +{Math.round(metersToDisplayElev(stats.gainM, unit)).toLocaleString()}
            </span>
          </div>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Loss</span>
            <span className="si-elev-profile-chart__stat-value si-elev-profile-chart__stat-value--loss">
              {Math.round(metersToDisplayElev(stats.lossM, unit)).toLocaleString()}
            </span>
          </div>
          <div className="si-elev-profile-chart__stat">
            <span className="si-elev-profile-chart__stat-label">Max grade</span>
            <span className="si-elev-profile-chart__stat-value">{stats.maxGradePct.toFixed(1)}%</span>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
