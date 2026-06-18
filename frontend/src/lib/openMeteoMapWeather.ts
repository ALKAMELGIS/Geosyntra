/**
 * Open-Meteo map weather intelligence (no API key).
 * @see https://open-meteo.com/en/docs
 */

export type OpenMeteoMapWeatherDaily = {
  date: string;
  weatherCode: number;
  label: string;
  icon: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  windMaxKmh: number | null;
};

export type OpenMeteoMapWeatherHourly = {
  time: string;
  tempC: number | null;
  precipMm: number | null;
  weatherCode: number;
  label: string;
  icon: string;
};

export type OpenMeteoMapWeatherBundle = {
  lat: number;
  lng: number;
  placeName: string;
  fetchedAt: string;
  timezone: string;
  current: {
    tempC: number | null;
    humidityPct: number | null;
    precipMm: number | null;
    windKmh: number | null;
    windDirDeg: number | null;
    windDirLabel: string;
    weatherCode: number;
    label: string;
    icon: string;
  };
  hourly: OpenMeteoMapWeatherHourly[];
  daily: OpenMeteoMapWeatherDaily[];
};

const WMO: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear', icon: 'fa-sun' },
  1: { label: 'Mainly clear', icon: 'fa-sun' },
  2: { label: 'Partly cloudy', icon: 'fa-cloud-sun' },
  3: { label: 'Overcast', icon: 'fa-cloud' },
  45: { label: 'Fog', icon: 'fa-smog' },
  48: { label: 'Rime fog', icon: 'fa-smog' },
  51: { label: 'Light drizzle', icon: 'fa-cloud-rain' },
  53: { label: 'Drizzle', icon: 'fa-cloud-rain' },
  55: { label: 'Heavy drizzle', icon: 'fa-cloud-showers-heavy' },
  61: { label: 'Light rain', icon: 'fa-cloud-rain' },
  63: { label: 'Rain', icon: 'fa-cloud-rain' },
  65: { label: 'Heavy rain', icon: 'fa-cloud-showers-heavy' },
  71: { label: 'Light snow', icon: 'fa-snowflake' },
  73: { label: 'Snow', icon: 'fa-snowflake' },
  75: { label: 'Heavy snow', icon: 'fa-snowflake' },
  80: { label: 'Rain showers', icon: 'fa-cloud-bolt' },
  81: { label: 'Rain showers', icon: 'fa-cloud-bolt' },
  82: { label: 'Violent showers', icon: 'fa-cloud-bolt' },
  95: { label: 'Thunderstorm', icon: 'fa-bolt' },
  96: { label: 'Thunderstorm hail', icon: 'fa-bolt' },
  99: { label: 'Thunderstorm hail', icon: 'fa-bolt' },
};

export function openMeteoWmoLabel(code: number): { label: string; icon: string } {
  return WMO[code] ?? { label: 'Unknown', icon: 'fa-cloud' };
}

export function openMeteoWindCompass(deg: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round(deg / 45) % 8;
  return dirs[i] ?? '—';
}

export async function openMeteoForwardGeocode(
  query: string,
): Promise<{ lat: number; lng: number; name: string } | null> {
  const q = query.trim();
  if (q.length < 2 || q.length > 200) return null;
  const latLng = q.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (latLng) {
    const lat = Number(latLng[1]);
    const lng = Number(latLng[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    }
  }
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };
    const r = data.results?.[0];
    if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
    const name = [r.name, r.country].filter(Boolean).join(', ');
    return { lat: r.latitude, lng: r.longitude, name: name || q };
  } catch {
    return null;
  }
}

export async function fetchOpenMeteoMapWeather(
  lat: number,
  lng: number,
  placeName?: string,
): Promise<OpenMeteoMapWeatherBundle> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(lat));
  u.searchParams.set('longitude', String(lng));
  u.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
  );
  u.searchParams.set('hourly', 'temperature_2m,precipitation,weather_code,wind_speed_10m');
  u.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
  );
  u.searchParams.set('timezone', 'auto');
  u.searchParams.set('forecast_days', '7');

  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

  const data = (await res.json()) as {
    timezone?: string;
    current?: Record<string, number>;
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      weather_code?: number[];
    };
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_sum?: number[];
      wind_speed_10m_max?: number[];
    };
  };

  const curCode = Number(data.current?.weather_code ?? 0);
  const curWmo = openMeteoWmoLabel(curCode);
  const windDir = Number(data.current?.wind_direction_10m);

  const hourly: OpenMeteoMapWeatherHourly[] = [];
  const ht = data.hourly?.time ?? [];
  for (let i = 0; i < Math.min(ht.length, 24); i += 1) {
    const code = Number(data.hourly?.weather_code?.[i] ?? 0);
    const w = openMeteoWmoLabel(code);
    hourly.push({
      time: ht[i] ?? '',
      tempC: numOrNull(data.hourly?.temperature_2m?.[i]),
      precipMm: numOrNull(data.hourly?.precipitation?.[i]),
      weatherCode: code,
      label: w.label,
      icon: w.icon,
    });
  }

  const daily: OpenMeteoMapWeatherDaily[] = [];
  const dt = data.daily?.time ?? [];
  for (let i = 0; i < dt.length; i += 1) {
    const code = Number(data.daily?.weather_code?.[i] ?? 0);
    const w = openMeteoWmoLabel(code);
    daily.push({
      date: dt[i] ?? '',
      weatherCode: code,
      label: w.label,
      icon: w.icon,
      tempMaxC: numOrNull(data.daily?.temperature_2m_max?.[i]),
      tempMinC: numOrNull(data.daily?.temperature_2m_min?.[i]),
      precipMm: numOrNull(data.daily?.precipitation_sum?.[i]),
      windMaxKmh: numOrNull(data.daily?.wind_speed_10m_max?.[i]),
    });
  }

  return {
    lat,
    lng,
    placeName: placeName?.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    fetchedAt: new Date().toISOString(),
    timezone: data.timezone ?? 'UTC',
    current: {
      tempC: numOrNull(data.current?.temperature_2m),
      humidityPct: numOrNull(data.current?.relative_humidity_2m),
      precipMm: numOrNull(data.current?.precipitation),
      windKmh: numOrNull(data.current?.wind_speed_10m),
      windDirDeg: Number.isFinite(windDir) ? windDir : null,
      windDirLabel: openMeteoWindCompass(Number.isFinite(windDir) ? windDir : null),
      weatherCode: curCode,
      label: curWmo.label,
      icon: curWmo.icon,
    },
    hourly,
    daily,
  };
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
