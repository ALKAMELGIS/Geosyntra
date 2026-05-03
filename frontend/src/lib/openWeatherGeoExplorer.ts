/**
 * OpenWeatherMap (https://openweathermap.org/api) — current + 5-day/3h forecast for Geo AI context.
 */

const MAX_BLOCK = 3200

function clip(s: string): string {
  if (s.length <= MAX_BLOCK) return s
  return `${s.slice(0, MAX_BLOCK - 40)}\n[…truncated for model context…]\n`
}

/**
 * Fetches 2.5 weather + forecast; returns a markdown-style block for the system prompt.
 */
export async function buildOpenWeatherContextBlock(apiKey: string, lat: number, lng: number): Promise<string> {
  const key = apiKey.trim()
  if (!key) return ''

  const lines: string[] = []
  lines.push(
    '### OPENWEATHER FACTS (use for station-style current conditions and short-range forecast; cite “OpenWeather” in prose; do not invent values beyond this)',
  )
  lines.push(`Point: latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}`)
  lines.push('Source: https://api.openweathermap.org/data/2.5 (current + forecast), units=metric.')

  const base = new URL('https://api.openweathermap.org/data/2.5/weather')
  base.searchParams.set('lat', String(lat))
  base.searchParams.set('lon', String(lng))
  base.searchParams.set('units', 'metric')
  base.searchParams.set('appid', key)

  try {
    const res = await fetch(base.toString())
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      lines.push(`Current weather request failed (HTTP ${res.status}). ${errText.slice(0, 200)}`)
      return clip(lines.join('\n'))
    }
    const data = (await res.json()) as Record<string, unknown>
    const cod = data.cod
    if (cod !== undefined && String(cod) !== '200') {
      lines.push(`API message: ${String(data.message ?? cod)}`)
      return clip(lines.join('\n'))
    }
    const name = typeof data.name === 'string' ? data.name : ''
    const main = data.main as Record<string, unknown> | undefined
    const wind = data.wind as Record<string, unknown> | undefined
    const w0 = Array.isArray(data.weather) ? (data.weather as Record<string, unknown>[])[0] : undefined
    const desc = w0 && typeof w0.description === 'string' ? w0.description : ''
    const mainTemp = main && typeof main.temp === 'number' ? main.temp : null
    const feels = main && typeof main.feels_like === 'number' ? main.feels_like : null
    const hum = main && typeof main.humidity === 'number' ? main.humidity : null
    const pr = main && typeof main.pressure === 'number' ? main.pressure : null
    const spd = wind && typeof wind.speed === 'number' ? wind.speed : null
    const deg = wind && typeof wind.deg === 'number' ? wind.deg : null
    lines.push(
      `Current${name ? ` (${name})` : ''}: ${desc || 'n/a'} — temp ${mainTemp != null ? `${mainTemp.toFixed(1)}°C` : 'n/a'}, feels ${feels != null ? `${feels.toFixed(1)}°C` : 'n/a'}, humidity ${hum != null ? `${hum}%` : 'n/a'}, pressure ${pr != null ? `${pr} hPa` : 'n/a'}, wind ${spd != null ? `${spd} m/s` : 'n/a'}${deg != null ? ` @ ${deg}°` : ''}.`,
    )
  } catch (e) {
    lines.push(`Current weather fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const fc = new URL('https://api.openweathermap.org/data/2.5/forecast')
    fc.searchParams.set('lat', String(lat))
    fc.searchParams.set('lon', String(lng))
    fc.searchParams.set('units', 'metric')
    fc.searchParams.set('cnt', '24')
    fc.searchParams.set('appid', key)
    const res = await fetch(fc.toString())
    if (!res.ok) {
      lines.push(`Forecast request failed (HTTP ${res.status}).`)
      return clip(lines.join('\n'))
    }
    const data = (await res.json()) as {
      list?: Array<{
        dt_txt?: string
        main?: { temp?: number; feels_like?: number }
        pop?: number
        weather?: Array<{ description?: string }>
      }>
    }
    const list = data.list ?? []
    lines.push('Next intervals (3 h steps, first rows):')
    for (let i = 0; i < Math.min(12, list.length); i++) {
      const it = list[i]
      const t = it?.main?.temp
      const fl = it?.main?.feels_like
      const pop = it?.pop
      const d0 = it?.weather?.[0]?.description
      lines.push(
        `  - ${it?.dt_txt ?? 'n/a'}: ${d0 ?? 'n/a'}, temp ${typeof t === 'number' ? `${t.toFixed(1)}°C` : 'n/a'}, feels ${typeof fl === 'number' ? `${fl.toFixed(1)}°C` : 'n/a'}, precip prob ${typeof pop === 'number' ? `${Math.round(pop * 100)}%` : 'n/a'}`,
      )
    }
  } catch (e) {
    lines.push(`Forecast fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  return clip(lines.join('\n'))
}
