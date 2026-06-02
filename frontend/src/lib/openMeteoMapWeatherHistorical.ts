/**
 * Open-Meteo historical day weather for map tools (archive + recent forecast gap).
 */
import {
  wxHistoryOpenMeteoArchiveEndDate,
  wxHistoryOpenMeteoLatestEndDate,
} from './openWeatherTimeHistory';
import {
  openMeteoWmoLabel,
  openMeteoWindCompass,
  type OpenMeteoMapWeatherBundle,
  type OpenMeteoMapWeatherHourly,
} from './openMeteoMapWeather';

export const OPEN_METEO_HISTORICAL_MIN_DATE = '1950-01-01';

export type OpenMeteoDaySnapshot = {
  date: string;
  title: string;
  tempC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  humidityPct: number | null;
  precipMm: number | null;
  windKmh: number | null;
  windDirLabel: string;
  weatherCode: number;
  label: string;
  icon: string;
};

export type OpenMeteoHistoricalDayBundle = {
  lat: number;
  lng: number;
  placeName: string;
  date: string;
  timezone: string;
  snapshot: OpenMeteoDaySnapshot;
  hourly: OpenMeteoMapWeatherHourly[];
};

export type OpenMeteoTemporalComparison = {
  anchorDate: string;
  current: OpenMeteoDaySnapshot;
  lastYear: OpenMeteoDaySnapshot;
  fiveYearsAgo: OpenMeteoDaySnapshot;
};

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function meanFinite(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function openMeteoSameDayYearsAgo(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y - years, m - 1, d, 12)).toISOString().slice(0, 10);
}

export function isOpenMeteoViewDateToday(isoDate: string, ref: Date = new Date()): boolean {
  return isoDate === wxHistoryOpenMeteoLatestEndDate(ref);
}

export function validateOpenMeteoHistoricalDate(isoDate: string, ref: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Invalid date.';
  if (isoDate < OPEN_METEO_HISTORICAL_MIN_DATE) {
    return `Historical data starts ${OPEN_METEO_HISTORICAL_MIN_DATE}.`;
  }
  const latest = wxHistoryOpenMeteoLatestEndDate(ref);
  if (isoDate > latest) return `Date cannot be after ${latest}.`;
  return null;
}

function snapshotTitle(dateIso: string, ref: Date = new Date()): string {
  if (isOpenMeteoViewDateToday(dateIso, ref)) return 'Current (today)';
  try {
    const label = new Date(`${dateIso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return label;
  } catch {
    return dateIso;
  }
}

function pickNoonIndex(times: string[], dateIso: string): number {
  const noonKey = `${dateIso}T12:00`;
  let idx = times.findIndex(t => t.startsWith(noonKey));
  if (idx < 0) idx = Math.floor(times.length / 2);
  return Math.max(0, idx);
}

type HourlyPayload = {
  time?: string[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  precipitation?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  weather_code?: (number | null)[];
};

type DailyPayload = {
  time?: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_sum?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
};

function buildSnapshotFromHourlyDaily(
  dateIso: string,
  hourly: HourlyPayload | undefined,
  daily: DailyPayload | undefined,
  ref: Date,
): { snapshot: OpenMeteoDaySnapshot; hourlyRows: OpenMeteoMapWeatherHourly[] } {
  const times = hourly?.time ?? [];
  const hourlyRows: OpenMeteoMapWeatherHourly[] = [];
  const humiditySamples: number[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    if (!t || !t.startsWith(dateIso)) continue;
    const code = Number(hourly?.weather_code?.[i] ?? 0);
    const wmo = openMeteoWmoLabel(code);
    const hum = numOrNull(hourly?.relative_humidity_2m?.[i]);
    if (hum != null) humiditySamples.push(hum);
    hourlyRows.push({
      time: t,
      tempC: numOrNull(hourly?.temperature_2m?.[i]),
      precipMm: numOrNull(hourly?.precipitation?.[i]),
      weatherCode: code,
      label: wmo.label,
      icon: wmo.icon,
    });
  }

  const dIdx = daily?.time?.indexOf(dateIso) ?? -1;
  const tempMax = dIdx >= 0 ? numOrNull(daily?.temperature_2m_max?.[dIdx]) : null;
  const tempMin = dIdx >= 0 ? numOrNull(daily?.temperature_2m_min?.[dIdx]) : null;
  const precipSum = dIdx >= 0 ? numOrNull(daily?.precipitation_sum?.[dIdx]) : null;
  const windMaxMs = dIdx >= 0 ? numOrNull(daily?.wind_speed_10m_max?.[dIdx]) : null;
  const dailyCode = dIdx >= 0 ? Number(daily?.weather_code?.[dIdx] ?? 0) : 0;

  const noonIdx = pickNoonIndex(times, dateIso);
  const noonCode = Number(hourly?.weather_code?.[noonIdx] ?? dailyCode);
  const wmo = openMeteoWmoLabel(noonCode);
  const windDir = numOrNull(hourly?.wind_direction_10m?.[noonIdx]);
  const windMs = numOrNull(hourly?.wind_speed_10m?.[noonIdx]) ?? (windMaxMs != null ? windMaxMs : null);

  const temps = hourlyRows.map(h => h.tempC).filter((t): t is number => t != null);
  const tempMean = meanFinite(temps);
  const tempC =
    tempMean ??
    (tempMax != null && tempMin != null ? (tempMax + tempMin) / 2 : tempMax ?? tempMin);

  const snapshot: OpenMeteoDaySnapshot = {
    date: dateIso,
    title: snapshotTitle(dateIso, ref),
    tempC,
    tempMaxC: tempMax ?? (temps.length ? Math.max(...temps) : null),
    tempMinC: tempMin ?? (temps.length ? Math.min(...temps) : null),
    humidityPct: humiditySamples.length ? meanFinite(humiditySamples) : null,
    precipMm:
      precipSum ??
      (hourlyRows.reduce((sum, h) => sum + (h.precipMm ?? 0), 0) || null),
    windKmh: windMs != null ? windMs * 3.6 : null,
    windDirLabel: openMeteoWindCompass(windDir),
    weatherCode: noonCode,
    label: wmo.label,
    icon: wmo.icon,
  };

  return { snapshot, hourlyRows };
}

async function fetchOpenMeteoDayPayload(
  api: 'archive' | 'forecast',
  lat: number,
  lng: number,
  dateIso: string,
): Promise<{ timezone: string; hourly?: HourlyPayload; daily?: DailyPayload }> {
  const root =
    api === 'archive'
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
  const url = new URL(root);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
  );
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', dateIso);
  url.searchParams.set('end_date', dateIso);
  url.searchParams.set('wind_speed_unit', 'ms');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const label = api === 'archive' ? 'historical archive' : 'forecast';
    throw new Error(`Open-Meteo ${label} failed (${res.status})`);
  }
  const data = (await res.json()) as {
    timezone?: string;
    hourly?: HourlyPayload;
    daily?: DailyPayload;
  };
  return { timezone: data.timezone ?? 'UTC', hourly: data.hourly, daily: data.daily };
}

function apiForHistoricalDate(dateIso: string, ref: Date = new Date()): 'archive' | 'forecast' {
  return dateIso > wxHistoryOpenMeteoArchiveEndDate(ref) ? 'forecast' : 'archive';
}

/** Full day weather for a single calendar date (Open-Meteo Historical / forecast). */
export async function fetchOpenMeteoHistoricalDay(
  lat: number,
  lng: number,
  dateIso: string,
  placeName?: string,
  ref: Date = new Date(),
): Promise<OpenMeteoHistoricalDayBundle> {
  const err = validateOpenMeteoHistoricalDate(dateIso, ref);
  if (err) throw new Error(err);

  const api = apiForHistoricalDate(dateIso, ref);
  const payload = await fetchOpenMeteoDayPayload(api, lat, lng, dateIso);
  const { snapshot, hourlyRows } = buildSnapshotFromHourlyDaily(dateIso, payload.hourly, payload.daily, ref);

  return {
    lat,
    lng,
    placeName: placeName?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    date: dateIso,
    timezone: payload.timezone,
    snapshot,
    hourly: hourlyRows,
  };
}

/** Compare today vs same calendar day last year and 5 years ago. */
export async function fetchOpenMeteoTemporalComparison(
  lat: number,
  lng: number,
  placeName?: string,
  ref: Date = new Date(),
): Promise<OpenMeteoTemporalComparison> {
  const anchorDate = wxHistoryOpenMeteoLatestEndDate(ref);
  const lastYearDate = openMeteoSameDayYearsAgo(anchorDate, 1);
  const fiveYearsDate = openMeteoSameDayYearsAgo(anchorDate, 5);

  const [current, lastYear, fiveYearsAgo] = await Promise.all([
    fetchOpenMeteoHistoricalDay(lat, lng, anchorDate, placeName, ref).then(d => d.snapshot),
    fetchOpenMeteoHistoricalDay(lat, lng, lastYearDate, placeName, ref).then(d => ({
      ...d.snapshot,
      title: `Same day last year (${lastYearDate})`,
    })),
    fetchOpenMeteoHistoricalDay(lat, lng, fiveYearsDate, placeName, ref).then(d => ({
      ...d.snapshot,
      title: `Same date 5 years ago (${fiveYearsDate})`,
    })),
  ]);

  return { anchorDate, current, lastYear, fiveYearsAgo };
}

export function historicalDayToMapBundle(
  day: OpenMeteoHistoricalDayBundle,
): OpenMeteoMapWeatherBundle {
  const s = day.snapshot;
  return {
    lat: day.lat,
    lng: day.lng,
    placeName: day.placeName,
    fetchedAt: new Date().toISOString(),
    timezone: day.timezone,
    current: {
      tempC: s.tempC,
      humidityPct: s.humidityPct,
      precipMm: s.precipMm,
      windKmh: s.windKmh,
      windDirDeg: null,
      windDirLabel: s.windDirLabel,
      weatherCode: s.weatherCode,
      label: s.label,
      icon: s.icon,
    },
    hourly: day.hourly,
    daily: [],
  };
}
