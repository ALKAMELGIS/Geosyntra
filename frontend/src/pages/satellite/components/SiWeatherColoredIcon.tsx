import {
  siWeatherIconToneFromFaIcon,
  siWeatherToneFromHistoryVariable,
  siWeatherToneFromMetric,
  type SiWeatherIconTone,
} from '../utils/siWeatherIconTone';
import type { WxHistoryVariableId } from '../../../lib/openWeatherTimeHistory';
import '../utils/siWeatherIcons.css';

export type SiWeatherColoredIconSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_PX: Record<SiWeatherColoredIconSize, number> = {
  sm: 14,
  md: 18,
  lg: 22,
  hero: 28,
};

export type SiWeatherColoredIconProps = {
  /** Font Awesome weather name (`fa-sun`, `fa-solid fa-cloud-rain`, …). */
  icon?: string;
  tone?: SiWeatherIconTone;
  size?: SiWeatherColoredIconSize;
  className?: string;
  title?: string;
};

function SunDisc() {
  return (
    <>
      <circle cx="12" cy="12" r="4.25" fill="currentColor" className="si-wx-colored__sun" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
        <line
          key={deg}
          x1="12"
          y1="12"
          x2="12"
          y2="3.5"
          stroke="currentColor"
          className="si-wx-colored__sun"
          strokeWidth="1.6"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </>
  );
}

function CloudShape({ className }: { className: string }) {
  return (
    <path
      className={className}
      d="M7.5 15.5h9.8c2.4 0 4.2-1.7 4.2-3.9 0-2-1.5-3.5-3.4-3.8-.5-2.8-3-4.8-5.9-4.8-2.2 0-4.1 1.2-5.1 3-2.5.3-4.1 2.2-4.1 4.4 0 2.3 1.8 4.1 4.5 4.1Z"
      fill="currentColor"
    />
  );
}

function RainDrops({ heavy }: { heavy?: boolean }) {
  const drops = heavy
    ? [
        [9, 17],
        [12, 18],
        [15, 17],
        [18, 18],
      ]
    : [
        [10, 17],
        [14, 18],
        [17, 17],
      ];
  return (
    <>
      {drops.map(([x, y]) => (
        <line
          key={`${x}-${y}`}
          x1={x}
          y1={y}
          x2={x}
          y2={y + 3.2}
          stroke="currentColor"
          className="si-wx-colored__rain"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function ToneArt({ tone }: { tone: SiWeatherIconTone }) {
  switch (tone) {
    case 'sun':
      return <SunDisc />;
    case 'partly':
      return (
        <>
          <circle cx="9" cy="10" r="3.2" fill="currentColor" className="si-wx-colored__sun" />
          <line x1="9" y1="5.5" x2="9" y2="3.8" stroke="currentColor" className="si-wx-colored__sun" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="9" y1="14.5" x2="9" y2="16.2" stroke="currentColor" className="si-wx-colored__sun" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="5.2" y1="10" x2="3.5" y2="10" stroke="currentColor" className="si-wx-colored__sun" strokeWidth="1.3" strokeLinecap="round" />
          <line x1="12.8" y1="10" x2="14.5" y2="10" stroke="currentColor" className="si-wx-colored__sun" strokeWidth="1.3" strokeLinecap="round" />
          <CloudShape className="si-wx-colored__cloud" />
        </>
      );
    case 'cloud':
      return <CloudShape className="si-wx-colored__cloud" />;
    case 'fog':
      return (
        <>
          <CloudShape className="si-wx-colored__cloud-mist" />
          <line x1="5" y1="17.5" x2="19" y2="17.5" stroke="currentColor" className="si-wx-colored__fog" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="6" y1="19.5" x2="18" y2="19.5" stroke="currentColor" className="si-wx-colored__fog" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
        </>
      );
    case 'rain':
      return (
        <>
          <CloudShape className="si-wx-colored__cloud" />
          <RainDrops />
        </>
      );
    case 'heavy-rain':
      return (
        <>
          <CloudShape className="si-wx-colored__cloud-deep" />
          <RainDrops heavy />
        </>
      );
    case 'snow':
      return (
        <>
          <CloudShape className="si-wx-colored__cloud" />
          <circle cx="10" cy="18.5" r="0.9" fill="currentColor" className="si-wx-colored__snow" />
          <circle cx="14" cy="19.2" r="0.9" fill="currentColor" className="si-wx-colored__snow" />
          <circle cx="17.5" cy="18.3" r="0.9" fill="currentColor" className="si-wx-colored__snow" />
        </>
      );
    case 'storm':
      return (
        <>
          <CloudShape className="si-wx-colored__storm-cloud" />
          <path
            d="M13.2 15.8 11.4 19.2h2.1l-1.4 2.8 3.2-4.2h-2.2l1.1-2Z"
            fill="currentColor"
            className="si-wx-colored__bolt"
          />
        </>
      );
    case 'wind':
      return (
        <>
          <path
            d="M5.5 9.5h8.8c1.4 0 2.4-.9 2.4-2.1S15.6 5.2 14.3 5.2H6.2"
            fill="none"
            stroke="currentColor"
            className="si-wx-colored__wind"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M5.5 14h7.2c1.1 0 1.9-.7 1.9-1.6s-.8-1.6-1.9-1.6H7.2"
            fill="none"
            stroke="currentColor"
            className="si-wx-colored__wind"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      );
    case 'humidity':
      return (
        <path
          d="M12 4.8c-3.4 4.2-5.2 6.4-5.2 8.6a5.2 5.2 0 1 0 10.4 0c0-2.2-1.8-4.4-5.2-8.6Z"
          fill="currentColor"
          className="si-wx-colored__humidity"
        />
      );
    case 'precip':
      return (
        <>
          <CloudShape className="si-wx-colored__cloud" />
          <RainDrops />
        </>
      );
    case 'temp':
      return (
        <>
          <rect x="9.5" y="4.5" width="5" height="12.5" rx="2.5" fill="currentColor" className="si-wx-colored__temp-glass" opacity="0.35" />
          <rect x="9.5" y="4.5" width="5" height="12.5" rx="2.5" fill="none" stroke="currentColor" className="si-wx-colored__temp" strokeWidth="1.5" />
          <circle cx="12" cy="16.8" r="2.3" fill="currentColor" className="si-wx-colored__temp" />
          <rect x="10.8" y="8" width="2.4" height="6.5" rx="1.1" fill="currentColor" className="si-wx-colored__temp-fill" />
        </>
      );
    case 'uv':
      return (
        <>
          <SunDisc />
          <text x="12" y="21.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="currentColor" className="si-wx-colored__uv">
            UV
          </text>
        </>
      );
    case 'visibility':
      return (
        <>
          <path
            d="M12 7.2c-3.8 0-7 2.2-8.5 5.2 1.5 3 4.7 5.2 8.5 5.2s7-2.2 8.5-5.2C19 9.4 15.8 7.2 12 7.2Z"
            fill="none"
            stroke="currentColor"
            className="si-wx-colored__visibility"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="12.4" r="2.2" fill="currentColor" className="si-wx-colored__visibility-pupil" />
        </>
      );
    case 'pressure':
      return (
        <>
          <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" className="si-wx-colored__pressure" strokeWidth="1.5" />
          <path d="M12 6.8v8.8M8.8 12h6.4" stroke="currentColor" className="si-wx-colored__pressure" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" className="si-wx-colored__pressure" />
        </>
      );
    default:
      return <CloudShape className="si-wx-colored__cloud" />;
  }
}

export function SiWeatherColoredIcon({
  icon,
  tone,
  size = 'md',
  className = '',
  title,
}: SiWeatherColoredIconProps) {
  const resolved = tone ?? siWeatherIconToneFromFaIcon(icon ?? 'fa-cloud');
  const px = SIZE_PX[size];
  const classes = ['si-wx-colored', `si-wx-colored--${resolved}`, className.trim()].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      width={px}
      height={px}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <ToneArt tone={resolved} />
    </svg>
  );
}

export function SiWeatherColoredIconFromMetric(
  props: Omit<SiWeatherColoredIconProps, 'tone' | 'icon'> & {
    metric: 'wind' | 'humidity' | 'precip' | 'temp';
  },
) {
  const { metric, ...rest } = props;
  return <SiWeatherColoredIcon tone={siWeatherToneFromMetric(metric)} {...rest} />;
}

export function SiWeatherColoredIconFromHistoryVariable(
  props: Omit<SiWeatherColoredIconProps, 'tone' | 'icon'> & { variable: WxHistoryVariableId },
) {
  const { variable, ...rest } = props;
  return <SiWeatherColoredIcon tone={siWeatherToneFromHistoryVariable(variable)} {...rest} />;
}
