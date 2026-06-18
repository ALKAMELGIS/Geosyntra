import {
  fetchOpenMeteoMapWeather,
  openMeteoWmoLabel,
  openMeteoWindCompass,
} from '../../../lib/openMeteoMapWeather';

export type LiveAoiWeatherSnapshot = {
  provider: 'openweather' | 'open-meteo';
  tempC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  windDirLabel: string;
  conditionLabel: string;
  conditionIcon: string;
  fetchedAt: string;
  error?: string;
};

const OWM_ICON: Record<string, string> = {
  Clear: 'fa-sun',
  Clouds: 'fa-cloud',
  Rain: 'fa-cloud-rain',
  Drizzle: 'fa-cloud-rain',
  Thunderstorm: 'fa-bolt',
  Snow: 'fa-snowflake',
  Mist: 'fa-smog',
  Smoke: 'fa-smog',
  Haze: 'fa-smog',
  Dust: 'fa-smog',
  Fog: 'fa-smog',
  Sand: 'fa-smog',
  Ash: 'fa-smog',
  Squall: 'fa-wind',
  Tornado: 'fa-wind',
};

function owmMainIcon(main?: string): string {
  if (!main) return 'fa-cloud-sun';
  return OWM_ICON[main] ?? 'fa-cloud-sun';
}

async function fetchOpenWeatherSnapshot(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<LiveAoiWeatherSnapshot | null> {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', apiKey.trim());

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  if (data.cod !== undefined && String(data.cod) !== '200') return null;

  const main = data.main as Record<string, unknown> | undefined;
  const wind = data.wind as Record<string, unknown> | undefined;
  const w0 = Array.isArray(data.weather) ? (data.weather as Record<string, unknown>[])[0] : undefined;
  const mainGroup = w0 && typeof w0.main === 'string' ? w0.main : '';
  const desc = w0 && typeof w0.description === 'string' ? w0.description : '—';
  const tempC = main && typeof main.temp === 'number' ? main.temp : null;
  const humidityPct = main && typeof main.humidity === 'number' ? main.humidity : null;
  const windMs = wind && typeof wind.speed === 'number' ? wind.speed : null;
  const windDeg = wind && typeof wind.deg === 'number' ? wind.deg : null;

  return {
    provider: 'openweather',
    tempC,
    humidityPct,
    windKmh: windMs != null ? windMs * 3.6 : null,
    windDirLabel: openMeteoWindCompass(windDeg),
    conditionLabel: desc,
    conditionIcon: owmMainIcon(mainGroup),
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOpenMeteoSnapshot(lat: number, lng: number): Promise<LiveAoiWeatherSnapshot> {
  const bundle = await fetchOpenMeteoMapWeather(lat, lng);
  const wmo = openMeteoWmoLabel(bundle.current.weatherCode);
  return {
    provider: 'open-meteo',
    tempC: bundle.current.tempC,
    humidityPct: bundle.current.humidityPct,
    windKmh: bundle.current.windKmh,
    windDirLabel: bundle.current.windDirLabel,
    conditionLabel: wmo.label,
    conditionIcon: wmo.icon,
    fetchedAt: bundle.fetchedAt,
  };
}

/** Current weather at AOI click / centroid — OpenWeather when keyed, else Open-Meteo. */
export async function fetchLiveAoiWeatherSnapshot(
  lat: number,
  lng: number,
  openWeatherApiKey: string,
): Promise<LiveAoiWeatherSnapshot> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      provider: 'open-meteo',
      tempC: null,
      humidityPct: null,
      windKmh: null,
      windDirLabel: '—',
      conditionLabel: '—',
      conditionIcon: 'fa-cloud',
      fetchedAt: new Date().toISOString(),
      error: 'Invalid coordinates',
    };
  }

  const key = openWeatherApiKey.trim();
  if (key) {
    try {
      const owm = await fetchOpenWeatherSnapshot(lat, lng, key);
      if (owm) return owm;
    } catch {
      /* fall through to Open-Meteo */
    }
  }

  try {
    return await fetchOpenMeteoSnapshot(lat, lng);
  } catch (e) {
    return {
      provider: 'open-meteo',
      tempC: null,
      humidityPct: null,
      windKmh: null,
      windDirLabel: '—',
      conditionLabel: '—',
      conditionIcon: 'fa-cloud',
      fetchedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : 'Weather unavailable',
    };
  }
}
