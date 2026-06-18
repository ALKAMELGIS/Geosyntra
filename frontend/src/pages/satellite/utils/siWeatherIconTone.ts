import type { WxHistoryVariableId } from '../../../lib/openWeatherTimeHistory';

/** Semantic color group for weather glyphs (WMO, metrics, history variables). */
export type SiWeatherIconTone =
  | 'sun'
  | 'partly'
  | 'cloud'
  | 'fog'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'storm'
  | 'wind'
  | 'humidity'
  | 'precip'
  | 'temp'
  | 'uv'
  | 'visibility'
  | 'pressure'
  | 'unknown';

export function normalizeFaWeatherIconName(icon: string): string {
  return icon
    .trim()
    .replace(/^fa-solid\s+/i, '')
    .replace(/^fa-regular\s+/i, '')
    .replace(/^fa-/, '');
}

export function siWeatherIconToneFromFaIcon(icon: string): SiWeatherIconTone {
  switch (normalizeFaWeatherIconName(icon)) {
    case 'sun':
      return 'sun';
    case 'cloud-sun':
    case 'cloud-sun-rain':
      return 'partly';
    case 'cloud':
      return 'cloud';
    case 'smog':
      return 'fog';
    case 'cloud-rain':
      return 'rain';
    case 'cloud-showers-heavy':
      return 'heavy-rain';
    case 'snowflake':
      return 'snow';
    case 'cloud-bolt':
    case 'bolt':
      return 'storm';
    case 'wind':
      return 'wind';
    case 'droplet':
      return 'humidity';
    case 'temperature-half':
    case 'temperature-high':
    case 'temperature-low':
      return 'temp';
    case 'eye':
      return 'visibility';
    case 'gauge-high':
    case 'gauge':
      return 'pressure';
    case 'sun-plant-wilt':
      return 'uv';
    default:
      return 'unknown';
  }
}

export function siWeatherToneFromHistoryVariable(id: WxHistoryVariableId): SiWeatherIconTone {
  switch (id) {
    case 'temperature':
      return 'temp';
    case 'precipitation':
      return 'precip';
    case 'humidity':
      return 'humidity';
    case 'wind':
      return 'wind';
    case 'pressure':
      return 'pressure';
    case 'clouds':
      return 'cloud';
    default:
      return 'unknown';
  }
}

export function siWeatherToneFromMetric(metric: 'wind' | 'humidity' | 'precip' | 'temp'): SiWeatherIconTone {
  return metric;
}

/** @deprecated Prefer `<SiWeatherColoredIcon icon={...} />` — kept for legacy call sites. */
export function siWeatherIconClassName(icon: string, extraClass = ''): string {
  const name = normalizeFaWeatherIconName(icon);
  const tone = siWeatherIconToneFromFaIcon(icon);
  const extra = extraClass.trim();
  return ['fa-solid', `fa-${name}`, 'si-wx-icon', `si-wx-icon--${tone}`, extra].filter(Boolean).join(' ');
}

/** @deprecated Prefer `<SiWeatherColoredIcon tone={...} />`. */
export function siWeatherMetricIconClassName(metric: 'wind' | 'humidity' | 'precip', extraClass = ''): string {
  const icons = { wind: 'fa-wind', humidity: 'fa-droplet', precip: 'fa-cloud-rain' } as const;
  return siWeatherIconClassName(icons[metric], extraClass);
}
