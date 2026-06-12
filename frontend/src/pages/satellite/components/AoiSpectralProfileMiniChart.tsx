import './AoiSpectralProfileMiniChart.css';

export type SiAoiSpectralProfileMini = {
  mode: 'pixels' | 'indices';
  values: number[];
  labels: string[];
  yMin: number;
  yMax: number;
  subtitle: string;
};

const CHART_LINE = '#0d9488';
const CHART_BAR = '#64748b';
const CHART_BAR_ACCENT = '#0d9488';
const GRID_STROKE = 'rgba(148, 163, 184, 0.18)';
const AXIS_FILL = 'rgba(148, 163, 184, 0.72)';

function formatAxisValue(v: number, indices: boolean): string {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(indices ? 2 : 2);
}

function formatPointValue(v: number): string {
  if (!Number.isFinite(v)) return '';
  return v.toFixed(2);
}

/** Compact AOI spectral profile — cartographic styling, no decorative gradients. */
export function AoiSpectralProfileMiniChart({
  profile,
  className = '',
}: {
  profile: SiAoiSpectralProfileMini;
  className?: string;
}) {
  const w = 360;
  const h = 118;
  const padL = 34;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const { values, labels, yMin, yMax, mode } = profile;
  if (!values.length) return null;

  const yLo = Math.min(yMin, ...values.filter(Number.isFinite));
  const yHi = Math.max(yMax, ...values.filter(Number.isFinite));
  const span = Math.max(1e-6, yHi - yLo);
  const zeroY =
    yLo <= 0 && yHi >= 0 ? padT + innerH - ((0 - yLo) / span) * innerH : null;

  const ny = (v: number) => padT + innerH - ((v - yLo) / span) * innerH;
  const gridTicks = 4;
  const gridLines = Array.from({ length: gridTicks + 1 }, (_, i) => {
    const t = yLo + (span * i) / gridTicks;
    return { t, y: ny(t) };
  });

  const badgeLabel = mode === 'pixels' ? 'Pixel sample' : 'Zonal mean';

  return (
    <div className={['si-aoi-spectral-mini', className].filter(Boolean).join(' ')}>
      <div className="si-aoi-spectral-mini__head">
        <span className="si-aoi-spectral-mini__title">Spectral profile</span>
        <span className="si-aoi-spectral-mini__badge">{badgeLabel}</span>
      </div>
      <p className="si-aoi-spectral-mini__sub">{profile.subtitle}</p>
      <svg
        className="si-aoi-spectral-mini__svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Spectral profile chart"
      >
        {gridLines.map(({ t, y }) => (
          <g key={`grid-${t}`}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke={GRID_STROKE} strokeWidth={1} />
            <text x={padL - 5} y={y + 3} textAnchor="end" className="si-aoi-spectral-mini__tick">
              {formatAxisValue(t, mode === 'indices')}
            </text>
          </g>
        ))}

        {zeroY != null ? (
          <line
            x1={padL}
            y1={zeroY}
            x2={w - padR}
            y2={zeroY}
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {mode === 'indices' ? (
          <>
            {values.map((v, i) => {
              if (!Number.isFinite(v)) return null;
              const n = values.length;
              const slotW = innerW / Math.max(1, n);
              const barW = Math.min(18, slotW * 0.55);
              const cx = padL + slotW * i + slotW / 2;
              const baseY = zeroY ?? padT + innerH;
              const topY = ny(v);
              const y = Math.min(baseY, topY);
              const barH = Math.abs(topY - baseY);
              const lbl = labels[i] ?? `#${i + 1}`;
              return (
                <g key={`bar-${lbl}-${i}`}>
                  <rect
                    x={cx - barW / 2}
                    y={y}
                    width={barW}
                    height={Math.max(1, barH)}
                    rx={1}
                    fill={v >= 0 ? CHART_BAR_ACCENT : CHART_BAR}
                    opacity={0.88}
                  />
                  <text x={cx} y={Math.min(y, topY) - 4} textAnchor="middle" className="si-aoi-spectral-mini__val">
                    {formatPointValue(v)}
                  </text>
                  <text x={cx} y={h - 4} textAnchor="middle" className="si-aoi-spectral-mini__lbl">
                    {lbl}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          <>
            {(() => {
              const pts = values.map((v, i) => {
                const x =
                  values.length <= 1
                    ? padL + innerW / 2
                    : padL + (i / (values.length - 1)) * innerW;
                return `${x.toFixed(1)},${ny(v).toFixed(1)}`;
              });
              const lineD = `M ${pts.join(' L ')}`;
              const areaD = `${lineD} L ${padL + innerW},${padT + innerH} L ${padL},${padT + innerH} Z`;
              return (
                <>
                  <path d={areaD} fill="rgba(13, 148, 136, 0.08)" />
                  <path
                    d={lineD}
                    fill="none"
                    stroke={CHART_LINE}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}
