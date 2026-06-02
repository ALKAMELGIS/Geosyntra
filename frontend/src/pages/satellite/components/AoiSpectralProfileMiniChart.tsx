import { useId } from 'react';
import './AoiSpectralProfileMiniChart.css';

export type SiAoiSpectralProfileMini = {
  mode: 'pixels' | 'indices';
  values: number[];
  labels: string[];
  yMin: number;
  yMax: number;
  subtitle: string;
};

/** Compact AOI spectral / index profile for map overlay and contextual dock. */
export function AoiSpectralProfileMiniChart({
  profile,
  className = '',
}: {
  profile: SiAoiSpectralProfileMini;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const w = 360;
  const h = 112;
  const padL = 4;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const { values, labels, yMin, yMax, mode } = profile;
  if (!values.length) return null;

  const span = Math.max(1e-6, yMax - yMin);
  const nx = (i: number) => {
    if (values.length <= 1) return padL + innerW / 2;
    return padL + (i / (values.length - 1)) * innerW;
  };
  const ny = (v: number) => padT + innerH - ((v - yMin) / span) * innerH;

  const pts = values.map((v, i) => `${nx(i).toFixed(1)},${ny(v).toFixed(1)}`);
  const lineD = `M ${pts.join(' L ')}`;
  const areaD = `${lineD} L ${nx(values.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L ${nx(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  return (
    <div className={['si-aoi-spectral-mini', className].filter(Boolean).join(' ')}>
      <div className="si-aoi-spectral-mini__head">
        <span className="si-aoi-spectral-mini__title">Spectral profile</span>
        <span className="si-aoi-spectral-mini__badge">
          {mode === 'pixels' ? 'Pixel spread' : 'Index mix'}
        </span>
      </div>
      <p className="si-aoi-spectral-mini__sub">{profile.subtitle}</p>
      <svg
        className="si-aoi-spectral-mini__svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Spectral profile chart"
      >
        <defs>
          <linearGradient id={`si-aoi-spectral-stroke-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="45%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
          <linearGradient id={`si-aoi-spectral-fill-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.35)" />
            <stop offset="100%" stopColor="rgba(15, 15, 18, 0.02)" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#si-aoi-spectral-fill-${uid})`} />
        <path
          d={lineD}
          fill="none"
          stroke={`url(#si-aoi-spectral-stroke-${uid})`}
          strokeWidth={mode === 'indices' ? 2.4 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {mode === 'indices' &&
          values.map((v, i) => (
            <circle
              key={`${labels[i] ?? i}-${i}`}
              cx={nx(i)}
              cy={ny(v)}
              r={5}
              fill={['#22d3ee', '#2dd4bf', '#818cf8', '#c084fc', '#f472b6', '#fb923c'][i % 6]}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1}
            />
          ))}
        {mode === 'indices' &&
          labels.map((lbl, i) => (
            <text
              key={`lbl-${lbl}-${i}`}
              x={nx(i)}
              y={h - 4}
              textAnchor="middle"
              className="si-aoi-spectral-mini__lbl"
            >
              {lbl}
            </text>
          ))}
      </svg>
      <div className="si-aoi-spectral-mini__axis" aria-hidden>
        <span>{yMin.toFixed(mode === 'indices' ? 3 : 2)}</span>
        <span>{yMax.toFixed(mode === 'indices' ? 3 : 2)}</span>
      </div>
    </div>
  );
}
