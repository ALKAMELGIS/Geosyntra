/**
 * Weather time-series for map analytics — Open-Meteo only (archive ERA5 + forecast through latest available).
 */

import * as XLSX from 'xlsx';

export type WxHistoryVariableId =
  | 'temperature'
  | 'precipitation'
  | 'humidity'
  | 'wind'
  | 'pressure'
  | 'clouds';

export type WxHistoryPoint = {
  time: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  pressureHpa: number | null;
  cloudPct: number | null;
};

export type WxHistoryProvider = 'open-meteo';

export type WxHistorySeries = {
  lat: number;
  lng: number;
  placeName: string;
  provider: WxHistoryProvider;
  points: WxHistoryPoint[];
  fetchedAt: string;
  timezone: string;
  startDate: string;
  endDate: string;
};

export type WxHistoryRange = '7d' | '14d' | '30d';

export const WX_HISTORY_VARIABLES: {
  id: WxHistoryVariableId;
  label: string;
  unit: string;
  color: string;
}[] = [
  { id: 'temperature', label: 'Temperature', unit: '°C', color: '#fb923c' },
  { id: 'precipitation', label: 'Rainfall', unit: 'mm', color: '#38bdf8' },
  { id: 'humidity', label: 'Humidity', unit: '%', color: '#22d3ee' },
  { id: 'wind', label: 'Wind', unit: 'km/h', color: '#38bdf8' },
  { id: 'pressure', label: 'Pressure', unit: 'hPa', color: '#1d4ed8' },
  { id: 'clouds', label: 'Cloud cover', unit: '%', color: '#94a3b8' },
];

const CACHE = new Map<string, { at: number; data: WxHistorySeries }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export function wxHistoryIsoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive preset window ending today (local calendar). */
export function wxHistoryPresetDateRange(range: WxHistoryRange): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - pastDaysForRange(range));
  return { startDate: wxHistoryIsoDate(start), endDate: wxHistoryIsoDate(end) };
}

export function wxHistoryAddDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return wxHistoryIsoDate(dt);
}

export function wxHistoryDaysBetween(startDate: string, endDate: string): number {
  const startMs = new Date(`${startDate}T00:00:00`).getTime();
  const endMs = new Date(`${endDate}T00:00:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.round((endMs - startMs) / 86_400_000);
}

export function wxHistoryDatesMatchPreset(
  startDate: string,
  endDate: string,
  range: WxHistoryRange,
): boolean {
  const preset = wxHistoryPresetDateRange(range);
  return startDate === preset.startDate && endDate === preset.endDate;
}

/** ERA5 archive on Open-Meteo is published with ~5 days delay. */
export const OPEN_METEO_ARCHIVE_LAG_DAYS = 5;

export function wxHistoryOpenMeteoArchiveEndDate(ref: Date = new Date()): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - OPEN_METEO_ARCHIVE_LAG_DAYS);
  return wxHistoryIsoDate(d);
}

/** Latest calendar day requested from Open-Meteo forecast (fills the archive gap through today). */
export function wxHistoryOpenMeteoLatestEndDate(ref: Date = new Date()): string {
  return wxHistoryIsoDate(ref);
}

export function wxHistoryValidateDateRange(startDate: string, endDate: string): string | null {
  if (startDate > endDate) return 'End date must be on or after the start date.';
  const span = wxHistoryDaysBetween(startDate, endDate);
  if (span > 365) return 'Maximum chart range is 365 days.';
  const latest = wxHistoryOpenMeteoLatestEndDate();
  if (endDate > latest) return `End date cannot be after the latest Open-Meteo data (${latest}).`;
  return null;
}

/** Split a range into archive (ERA5) and forecast slices for Open-Meteo hourly APIs. */
export function wxHistoryOpenMeteoFetchPlan(
  startDate: string,
  endDate: string,
  ref: Date = new Date(),
): {
  effectiveEnd: string;
  archive: { startDate: string; endDate: string } | null;
  forecast: { startDate: string; endDate: string } | null;
} {
  const latest = wxHistoryOpenMeteoLatestEndDate(ref);
  const effectiveEnd = endDate > latest ? latest : endDate;
  const archiveEnd = wxHistoryOpenMeteoArchiveEndDate(ref);
  let archive: { startDate: string; endDate: string } | null = null;
  let forecast: { startDate: string; endDate: string } | null = null;

  if (startDate <= archiveEnd) {
    archive = {
      startDate,
      endDate: effectiveEnd <= archiveEnd ? effectiveEnd : archiveEnd,
    };
  }

  const forecastStart =
    startDate > wxHistoryAddDaysIso(archiveEnd, 1) ? startDate : wxHistoryAddDaysIso(archiveEnd, 1);

  if (forecastStart <= effectiveEnd) {
    forecast = { startDate: forecastStart, endDate: effectiveEnd };
  }

  return { effectiveEnd, archive, forecast };
}

/** Each calendar day from start through end (inclusive), capped for API limits. */
export function wxHistoryEachDayIso(startDate: string, endDate: string, maxDays = 31): string[] {
  const out: string[] = [];
  let cur = startDate;
  while (cur <= endDate && out.length < maxDays) {
    out.push(cur);
    const next = wxHistoryAddDaysIso(cur, 1);
    if (next <= cur) break;
    cur = next;
  }
  return out;
}

export function filterWxHistoryPointsByDateRange(
  points: WxHistoryPoint[],
  startDate: string,
  endDate: string,
): WxHistoryPoint[] {
  const startMs = new Date(`${startDate}T00:00:00`).getTime();
  const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return points;
  return points.filter(p => {
    const t = new Date(p.time).getTime();
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
}

function cacheKey(lat: number, lng: number, startDate: string, endDate: string): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}:${startDate}:${endDate}:open-meteo-v2`;
}

function pastDaysForRange(range: WxHistoryRange): number {
  if (range === '30d') return 30;
  if (range === '14d') return 14;
  return 7;
}

function mergePointsByTime(maps: WxHistoryPoint[][]): WxHistoryPoint[] {
  const byTime = new Map<string, WxHistoryPoint>();
  for (const list of maps) {
    for (const p of list) {
      const prev = byTime.get(p.time);
      if (!prev) {
        byTime.set(p.time, { ...p });
        continue;
      }
      byTime.set(p.time, {
        time: p.time,
        temperatureC: p.temperatureC ?? prev.temperatureC,
        precipitationMm: p.precipitationMm ?? prev.precipitationMm,
        humidityPct: p.humidityPct ?? prev.humidityPct,
        windKmh: p.windKmh ?? prev.windKmh,
        pressureHpa: p.pressureHpa ?? prev.pressureHpa,
        cloudPct: p.cloudPct ?? prev.cloudPct,
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + ':00';
}

const OPEN_METEO_HOURLY_VARS =
  'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,cloud_cover,pressure_msl';

type OpenMeteoHourlyJson = {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    precipitation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    cloud_cover?: (number | null)[];
    pressure_msl?: (number | null)[];
  };
};

function parseOpenMeteoHourlyPayload(data: OpenMeteoHourlyJson): WxHistoryPoint[] {
  const h = data.hourly;
  const times = h?.time ?? [];
  const points: WxHistoryPoint[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    if (!t) continue;
    const windMs = h?.wind_speed_10m?.[i];
    points.push({
      time: t.length <= 16 ? `${t}:00` : t,
      temperatureC: numOrNull(h?.temperature_2m?.[i]),
      precipitationMm: numOrNull(h?.precipitation?.[i]),
      humidityPct: numOrNull(h?.relative_humidity_2m?.[i]),
      windKmh: windMs != null ? windMs * 3.6 : null,
      pressureHpa: numOrNull(h?.pressure_msl?.[i]),
      cloudPct: numOrNull(h?.cloud_cover?.[i]),
    });
  }
  return points;
}

async function fetchOpenMeteoHourlyRange(
  apiBase: 'archive' | 'forecast',
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<{ points: WxHistoryPoint[]; timezone: string }> {
  const root =
    apiBase === 'archive'
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
  const url = new URL(root);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('hourly', OPEN_METEO_HOURLY_VARS);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('wind_speed_unit', 'ms');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const label = apiBase === 'archive' ? 'historical archive' : 'forecast';
    throw new Error(`Open-Meteo ${label} failed (${res.status})`);
  }
  const data = (await res.json()) as OpenMeteoHourlyJson;
  return {
    points: parseOpenMeteoHourlyPayload(data),
    timezone: data.timezone ?? 'UTC',
  };
}

/** Open-Meteo hourly history: ERA5 archive through archive lag, then forecast through latest available day. */
export async function fetchOpenMeteoTimeHistory(
  lat: number,
  lng: number,
  range: WxHistoryRange,
  placeName?: string,
  dateRange?: { startDate: string; endDate: string },
): Promise<WxHistorySeries> {
  const resolved = dateRange ?? wxHistoryPresetDateRange(range);
  const plan = wxHistoryOpenMeteoFetchPlan(resolved.startDate, resolved.endDate);
  const chunks: WxHistoryPoint[][] = [];
  let timezone = 'UTC';
  const errors: string[] = [];

  if (plan.archive) {
    try {
      const arch = await fetchOpenMeteoHourlyRange(
        'archive',
        lat,
        lng,
        plan.archive.startDate,
        plan.archive.endDate,
      );
      if (arch.points.length) chunks.push(arch.points);
      timezone = arch.timezone;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (plan.forecast) {
    try {
      const fc = await fetchOpenMeteoHourlyRange(
        'forecast',
        lat,
        lng,
        plan.forecast.startDate,
        plan.forecast.endDate,
      );
      if (fc.points.length) chunks.push(fc.points);
      timezone = fc.timezone;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const points = filterWxHistoryPointsByDateRange(
    mergePointsByTime(chunks),
    resolved.startDate,
    plan.effectiveEnd,
  );

  if (!points.length) {
    throw new Error(
      errors.length
        ? errors.join(' ')
        : 'Open-Meteo returned no hourly samples for this location and date range.',
    );
  }

  return {
    lat,
    lng,
    placeName: placeName?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    provider: 'open-meteo',
    points,
    fetchedAt: new Date().toISOString(),
    timezone,
    startDate: resolved.startDate,
    endDate: plan.effectiveEnd,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

type OwmForecastItem = {
  dt?: number;
  dt_txt?: string;
  main?: { temp?: number; humidity?: number; pressure?: number };
  pop?: number;
  wind?: { speed?: number };
  clouds?: { all?: number };
};

function owmForecastToPoints(list: OwmForecastItem[]): WxHistoryPoint[] {
  return list
    .map(it => {
      const t =
        it.dt_txt ??
        (it.dt != null ? msToIso(it.dt * 1000) : null);
      if (!t) return null;
      const windMs = it.wind?.speed;
      return {
        time: t.replace(' ', 'T'),
        temperatureC: numOrNull(it.main?.temp),
        precipitationMm: null,
        humidityPct: numOrNull(it.main?.humidity),
        windKmh: windMs != null ? windMs * 3.6 : null,
        pressureHpa: numOrNull(it.main?.pressure),
        cloudPct: numOrNull(it.clouds?.all),
      };
    })
    .filter((p): p is WxHistoryPoint => p != null);
}

/** OpenWeather 2.5 forecast (3 h steps, ~5 days). */
export async function fetchOpenWeatherForecastTimeHistory(
  apiKey: string,
  lat: number,
  lng: number,
  placeName?: string,
): Promise<WxHistoryPoint[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const fc = new URL('https://api.openweathermap.org/data/2.5/forecast');
  fc.searchParams.set('lat', String(lat));
  fc.searchParams.set('lon', String(lng));
  fc.searchParams.set('units', 'metric');
  fc.searchParams.set('cnt', '40');
  fc.searchParams.set('appid', key);

  const res = await fetch(fc.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenWeather forecast failed (${res.status}). ${body.slice(0, 120)}`);
  }
  const data = (await res.json()) as { list?: OwmForecastItem[] };
  return owmForecastToPoints(data.list ?? []);
}

/** OpenWeather One Call 3.0 timemachine — one UTC day (hourly). */
export async function fetchOpenWeatherTimemachineDay(
  apiKey: string,
  lat: number,
  lng: number,
  dayStartUtcMs: number,
): Promise<WxHistoryPoint[]> {
  const key = apiKey.trim();
  if (!key) return [];
  const dtUnix = Math.floor((dayStartUtcMs + 12 * 3600_000) / 1000);
  const tm = new URL('https://api.openweathermap.org/data/3.0/onecall/timemachine');
  tm.searchParams.set('lat', String(lat));
  tm.searchParams.set('lon', String(lng));
  tm.searchParams.set('dt', String(dtUnix));
  tm.searchParams.set('appid', key);
  tm.searchParams.set('units', 'metric');

  const res = await fetch(tm.toString());
  if (!res.ok) return [];

  type OwmHistRow = {
    dt?: number;
    temp?: number;
    humidity?: number;
    pressure?: number;
    wind_speed?: number;
    clouds?: number;
    rain?: { '1h'?: number };
  };
  const td = (await res.json()) as { data?: OwmHistRow[]; hourly?: OwmHistRow[] };
  const hist = td.data?.length ? td.data : td.hourly ?? [];
  return hist
    .map(h => {
      if (h.dt == null) return null;
      return {
        time: msToIso(h.dt * 1000),
        temperatureC: numOrNull(h.temp),
        precipitationMm: numOrNull(h.rain?.['1h']),
        humidityPct: numOrNull(h.humidity),
        windKmh: h.wind_speed != null ? h.wind_speed * 3.6 : null,
        pressureHpa: numOrNull(h.pressure),
        cloudPct: numOrNull(h.clouds),
      };
    })
    .filter((p): p is WxHistoryPoint => p != null);
}

const OWM_TIMEMACHINE_BATCH = 4;
const OWM_TIMEMACHINE_MAX_DAYS = 30;

function isoDateToUtcNoonMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, 12);
}

/** OpenWeather One Call timemachine for each past day in [startDate, endDate]. */
export async function fetchOpenWeatherHistoricalForDateRange(
  apiKey: string,
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<WxHistoryPoint[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const today = wxHistoryIsoDate();
  const pastDays = wxHistoryEachDayIso(startDate, endDate, OWM_TIMEMACHINE_MAX_DAYS).filter(d => d < today);
  if (!pastDays.length) return [];

  const chunks: WxHistoryPoint[][] = [];
  for (let i = 0; i < pastDays.length; i += OWM_TIMEMACHINE_BATCH) {
    const batch = pastDays.slice(i, i + OWM_TIMEMACHINE_BATCH);
    const batchResults = await Promise.all(
      batch.map(day => fetchOpenWeatherTimemachineDay(key, lat, lng, isoDateToUtcNoonMs(day))),
    );
    for (const pts of batchResults) {
      if (pts.length) chunks.push(pts);
    }
  }
  return filterWxHistoryPointsByDateRange(mergePointsByTime(chunks), startDate, endDate);
}

/** Map weather time history — Open-Meteo historical archive + forecast through latest available day. */
export async function fetchWeatherTimeHistory(
  lat: number,
  lng: number,
  opts?: {
    /** @deprecated Ignored — time history uses Open-Meteo only. */
    apiKey?: string;
    range?: WxHistoryRange;
    startDate?: string;
    endDate?: string;
    placeName?: string;
    force?: boolean;
  },
): Promise<WxHistorySeries> {
  const range = opts?.range ?? '7d';
  const preset = wxHistoryPresetDateRange(range);
  const startDate = opts?.startDate ?? preset.startDate;
  const endDate = opts?.endDate ?? preset.endDate;
  const ck = cacheKey(lat, lng, startDate, endDate);
  if (!opts?.force) {
    const hit = CACHE.get(ck);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  }

  const rangeError = wxHistoryValidateDateRange(startDate, endDate);
  if (rangeError) throw new Error(rangeError);

  const series = await fetchOpenMeteoTimeHistory(lat, lng, range, opts?.placeName, {
    startDate,
    endDate,
  });
  CACHE.set(ck, { at: Date.now(), data: series });
  return series;
}

export function wxHistoryValueForVariable(
  point: WxHistoryPoint,
  variable: WxHistoryVariableId,
): number | null {
  switch (variable) {
    case 'temperature':
      return point.temperatureC;
    case 'precipitation':
      return point.precipitationMm;
    case 'humidity':
      return point.humidityPct;
    case 'wind':
      return point.windKmh;
    case 'pressure':
      return point.pressureHpa;
    case 'clouds':
      return point.cloudPct;
    default:
      return null;
  }
}

export function wxHistoryChartLabels(points: WxHistoryPoint[]): string[] {
  return points.map(p => {
    try {
      const d = new Date(p.time);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return p.time.slice(0, 16);
    }
  });
}

export function wxHistoryStats(values: number[]): { min: number; max: number; mean: number } | null {
  if (!values.length) return null;
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / values.length };
}

function sanitizeWxHistoryFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'location';
}

/** Download all loaded hourly samples as a single Excel sheet. */
export function downloadWxHistoryExcel(series: WxHistorySeries): void {
  const head = [
    'Date/time',
    'Temperature (°C)',
    'Rainfall (mm)',
    'Humidity (%)',
    'Wind (km/h)',
    'Pressure (hPa)',
    'Cloud cover (%)',
  ];
  const body = series.points.map(p => [
    p.time,
    p.temperatureC ?? '',
    p.precipitationMm ?? '',
    p.humidityPct ?? '',
    p.windKmh ?? '',
    p.pressureHpa ?? '',
    p.cloudPct ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    ['Weather time history'],
    ['Location', series.placeName],
    ['Latitude', series.lat],
    ['Longitude', series.lng],
    ['Provider', series.provider],
    ['Timezone', series.timezone],
    ['Exported', new Date().toISOString()],
    [],
    head,
    ...body,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Time_History');
  const base = sanitizeWxHistoryFileName(series.placeName);
  XLSX.writeFile(wb, `weather_time_history_${base}.xlsx`);
}
