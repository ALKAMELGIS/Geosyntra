import type { SiCropHealthWeatherContext } from './siCropHealthTypes';

/** Open-Meteo — no API key; used for weather fusion in Crop Health Intelligence. */
export async function fetchSiCropHealthWeather(
  lat: number,
  lng: number,
): Promise<SiCropHealthWeatherContext | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}` +
    '&current=temperature_2m,relative_humidity_2m&daily=precipitation_sum&timezone=auto&forecast_days=7';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number };
      daily?: { precipitation_sum?: number[] };
    };
    const temp = Number(data.current?.temperature_2m);
    const hum = Number(data.current?.relative_humidity_2m);
    const rainArr = data.daily?.precipitation_sum;
    const rainWeek = Array.isArray(rainArr)
      ? rainArr.filter(Number.isFinite).reduce((a, b) => a + Number(b), 0)
      : 0;
    return {
      temperatureC: Number.isFinite(temp) ? temp : 26,
      humidityPct: Number.isFinite(hum) ? hum : 50,
      rainfallMmWeek: Number.isFinite(rainWeek) ? rainWeek : 10,
      soilMoisturePct: Number.isFinite(hum) ? Math.min(95, hum * 0.85) : 45,
      source: 'api',
    };
  } catch {
    return null;
  }
}

export function cropHealthWeatherStress(ctx: SiCropHealthWeatherContext): number {
  let stress = 0;
  if (ctx.temperatureC > 38) stress += 0.35;
  else if (ctx.temperatureC > 34) stress += 0.2;
  else if (ctx.temperatureC < 5) stress += 0.25;
  if (ctx.humidityPct > 88) stress += 0.28;
  else if (ctx.humidityPct > 75) stress += 0.12;
  if (ctx.rainfallMmWeek < 2) stress += 0.18;
  else if (ctx.rainfallMmWeek > 80) stress += 0.15;
  if (ctx.soilMoisturePct < 25) stress += 0.22;
  else if (ctx.soilMoisturePct < 35) stress += 0.1;
  return Math.max(0, Math.min(1, stress));
}
