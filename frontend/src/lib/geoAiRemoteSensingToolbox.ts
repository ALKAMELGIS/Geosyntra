/**
 * Geo AI — map Remote Sensing / Main Toolbox intents from natural language (EN + light AR).
 * Returns structured effects for SatelliteIntelligence to apply (no React here).
 */

import { isMapPlaceShowOrGeocodeQuery } from './geoAiAgentIntent'

export type GeoAiRsLayerOption = { id: string; label: string }

export type GeoAiRsToolboxDrawTool = 'rectangle' | 'polygon' | 'circle' | 'select'

export type GeoAiRsToolboxEffect =
  | { kind: 'setWmsLayer'; layerId: string }
  | { kind: 'setImageryDate'; iso: string }
  | { kind: 'setTimeSeriesRange'; start: string; end: string }
  | { kind: 'setWmsOverlayVisible'; visible: boolean }
  | { kind: 'setDrawTool'; tool: GeoAiRsToolboxDrawTool }
  | { kind: 'generateTimeline' }
  | { kind: 'stopTimeline' }
  | { kind: 'openAoiDataUpload' }
  | { kind: 'openExploreStacFromRemoteSensing' }
  | { kind: 'setStaticChartsOpen'; open: boolean }
  | { kind: 'focusRemoteSensingPanel' }
  | { kind: 'runRemoteSensingAnalysis' }

export type GeoAiRsToolboxResult =
  | { handled: false }
  | { handled: true; ok: false; reply: string }
  | { handled: true; ok: true; reply: string; effects: GeoAiRsToolboxEffect[] }

const RS_INDEX_TOKENS = [
  'NDVI',
  'GNDVI',
  'NDRE',
  'NBR',
  'BSI',
  'NDWI',
  'MNDWI',
  'NDMI',
  'EVI',
  'SAVI',
  'NDSI',
  'LST',
  'TRUE COLOR',
  'TRUE_COLOR',
  'FALSE COLOR',
  'FALSE_COLOR',
  'SOIL',
] as const

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Reject pure Q&A so we do not hijack “what is NDVI?”. */
function looksInformationalQuestion(q: string): boolean {
  const t = q.trim()
  if (!/\?[\s]*$/.test(t)) return false
  return /\b(what|why|how|when|where|who|which|explain|define|meaning|difference|compare|is\s+there|are\s+there)\b/i.test(
    t.slice(0, Math.min(120, t.length)),
  )
}

function hasCommandCue(q: string): boolean {
  const u = q.toLowerCase()
  return (
    /\b(please|set|switch|select|use|change|pick|show|hide|enable|disable|turn on|turn off|open|close|run|start|stop|generate|draw|sketch|upload|add|focus|go to)\b/i.test(
      q,
    ) ||
    /\b(i want|i'd like|let me|اريد|أريد|افتح|اعرض|فعّل|عطّل|شغّل|اوقف|أوقف|ارسم|ارفع|اضف|أضف|غيّر|غير|اختر|حدد)\b/u.test(q) ||
    /\b(generate|stop)\s+(the\s+)?timeline\b/i.test(q) ||
    /\bخط\s*زمني|توليد|أوقف\s*الخط|اوقف\s*الخط|ايقاف\s*الخط|إيقاف\s*الخط/i.test(u) ||
    /\b(explore\s+stac|stac\s+catalog)\b/i.test(u)
  )
}

function parseIsoYmd(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (![y, mo, d].every(n => Number.isFinite(n))) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** DD/MM/YYYY or MM/DD/YYYY when day > 12 → unambiguous DMY. */
function parseSlashDate(raw: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(raw.trim())
  if (!m) return null
  let a = Number(m[1])
  let b = Number(m[2])
  let y = Number(m[3])
  if (![a, b, y].every(Number.isFinite)) return null
  if (y < 100) y += y >= 70 ? 1900 : 2000
  let day = a
  let month = b
  if (a > 12 && b <= 12) {
    day = a
    month = b
  } else if (b > 12 && a <= 12) {
    day = b
    month = a
  } else {
    /* both ≤ 12 — assume DD/MM (MENA default) */
    day = a
    month = b
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(y, month - 1, day))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseAnyDateToken(raw: string): string | null {
  const iso = parseIsoYmd(raw)
  if (iso) return iso
  return parseSlashDate(raw)
}

function collectIsoDates(text: string): string[] {
  const out: string[] = []
  const reIso = /\b(\d{4}-\d{2}-\d{2})\b/g
  let m: RegExpExecArray | null
  while ((m = reIso.exec(text)) !== null) {
    const v = parseIsoYmd(m[1]!)
    if (v) out.push(v)
  }
  const reSlash = /\b(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b/g
  while ((m = reSlash.exec(text)) !== null) {
    const v = parseSlashDate(m[1]!)
    if (v) out.push(v)
  }
  return out
}

function pickLayerIdForToken(opts: GeoAiRsLayerOption[], token: string): string | null {
  const want = token.replace(/[_-]+/g, ' ').trim().toUpperCase()
  if (!want || !opts.length) return null
  let best: { id: string; score: number } | null = null
  for (const o of opts) {
    const idU = o.id.toUpperCase()
    const labU = o.label.toUpperCase().replace(/\s+/g, ' ')
    let score = 0
    if (idU === want) score = 200
    else if (labU === want) score = 190
    else if (idU.includes(want) || labU.includes(want)) score = 120
    else {
      const wk = want.split(/\s+/).filter(Boolean)
      if (wk.length && wk.every(w => idU.includes(w) || labU.includes(w))) score = 80
    }
    if (score > 0 && (!best || score > best.score)) best = { id: o.id, score }
  }
  return best?.id ?? null
}

function extractLayerToken(q: string): string | null {
  const u = q.toUpperCase()
  for (const tok of RS_INDEX_TOKENS) {
    const compact = tok.replace(/\s+/g, '')
    if (u.includes(tok) || u.includes(compact)) return tok.replace(/\s+/g, ' ')
  }
  return null
}

function wantsLayerChange(q: string): boolean {
  return (
    /\b(set|switch|select|use|change|pick|show)\b/i.test(q) &&
    /\b(NDVI|GNDVI|NDRE|NBR|BSI|NDWI|MNDWI|NDMI|EVI|SAVI|NDSI|LST|true\s*color|false\s*color|soil)\b/i.test(q)
  )
}

export function tryGeoAiRemoteSensingToolboxAction(ctx: {
  query: string
  layerOptions: GeoAiRsLayerOption[]
}): GeoAiRsToolboxResult {
  const query = norm(ctx.query)
  if (!query) return { handled: false }

  if (isMapPlaceShowOrGeocodeQuery(query)) return { handled: false }

  if (looksInformationalQuestion(query) && !hasCommandCue(query)) return { handled: false }

  const effects: GeoAiRsToolboxEffect[] = []
  const notes: string[] = []

  const pushUnique = (e: GeoAiRsToolboxEffect) => {
    const key = JSON.stringify(e)
    const exists = effects.some(x => JSON.stringify(x) === key)
    if (!exists) effects.push(e)
  }

  /* Timeline */
  if (/\b(stop|cancel|clear)\s+(the\s+)?(weekly\s+)?timeline\b/i.test(query) || /\bأوقف|اوقف|ايقاف|إيقاف.*خط\s*زمني/i.test(query)) {
    pushUnique({ kind: 'stopTimeline' })
    notes.push('Stopped the weekly timeline session.')
  } else if (
    /\b(generate|create|start|build|refresh)\s+(the\s+)?(weekly\s+)?timeline\b/i.test(query) ||
    /\bتوليد|إنشاء|ابني|حدّث.*خط\s*زمني/i.test(query)
  ) {
    pushUnique({ kind: 'generateTimeline' })
    notes.push('Generated / refreshed the weekly timeline for the current index and date range.')
  }

  /* Remote sensing panel focus */
  if (
    /\b(open|show|focus|go to)\s+(the\s+)?(main\s+)?(remote\s+sensing|rs toolbox|satellite toolbox)\b/i.test(query) ||
    /\bافتح\s+(لوحة\s+)?(الاستشعار|استشعار عن بعد|صندوق الأدوات)/u.test(query)
  ) {
    pushUnique({ kind: 'focusRemoteSensingPanel' })
    notes.push('Opened the Remote sensing toolbox section.')
  }

  /* AOI upload wizard */
  if (
    /\b(add\s+data\s+source|upload\s+aoi|import\s+aoi|vector\s+upload|shapefile|geojson\s+upload)\b/i.test(query) ||
    /\b(ارفع|إضافة\s+مصدر|مصدر\s+بيانات|استيراد\s+aoi)/iu.test(query)
  ) {
    pushUnique({ kind: 'openAoiDataUpload' })
    notes.push('Opened Add layer → upload flow for AOI / vector data.')
  }

  /* Run full RS analysis (MPC + timeline when AOI exists) */
  if (
    /\b(run|execute|start)\s+(the\s+)?(remote\s+sensing\s+)?analysis\b/i.test(query) ||
    /\b(run|execute)\s+mpc\b/i.test(query) ||
    /\bشغّل|شغل|نفّذ|نفذ|تشغيل\s+التحليل|تحليل\s+الاستشعار/u.test(query)
  ) {
    pushUnique({ kind: 'runRemoteSensingAnalysis' })
    notes.push('Triggered **Run analysis** (clip + process when AOI and scenes are available).')
  }

  /* Static charts */
  if (/\b(show|open|display)\s+(the\s+)?(aoi\s+)?charts?\b/i.test(query) || /\bاعرض\s+الرسوم|افتح\s+الرسوم/u.test(query)) {
    pushUnique({ kind: 'setStaticChartsOpen', open: true })
    notes.push('Turned on AOI static charts on the map.')
  } else if (/\b(hide|close)\s+(the\s+)?(aoi\s+)?charts?\b/i.test(query) || /\bاخف|أخف|اغلق\s+الرسوم/u.test(query)) {
    pushUnique({ kind: 'setStaticChartsOpen', open: false })
    notes.push('Turned off AOI static charts overlay.')
  }

  /* WMS visibility — RS layer/overlay only (not "show Dubai on map"). */
  const wantsRsOverlayToggle =
    /\b(layer|overlay|wms|ndvi|ndwi|imagery|raster|satellite|sentinel|index|spectral)\b/i.test(query)
  if (wantsRsOverlayToggle) {
    if (/\b(hide|disable|turn off)\b/i.test(query)) {
      pushUnique({ kind: 'setWmsOverlayVisible', visible: false })
      notes.push('Turned off the RS imagery overlay on the map.')
    } else if (/\b(show|enable|turn on)\b/i.test(query)) {
      pushUnique({ kind: 'setWmsOverlayVisible', visible: true })
      notes.push('Enabled the RS imagery overlay on the map.')
    }
  }

  /* Draw tools */
  const drawRect = /\b(rectangle|rect|box)\s+(tool|mode|aoi)?\b/i.test(query) || /\b(draw|sketch)\s+(a\s+)?(rectangle|rect|box)\b/i.test(query)
  const drawPoly =
    /\bpolygon\s+(tool|mode|aoi)?\b/i.test(query) || /\b(draw|sketch)\s+(a\s+)?polygon\b/i.test(query) || /\bمضلع/u.test(query)
  const drawCirc =
    /\bcircle\s+(tool|mode|aoi)?\b/i.test(query) || /\b(draw|sketch)\s+(a\s+)?circle\b/i.test(query) || /\bدائرة/u.test(query)
  const drawSel = /\b(select|pointer|navigate)\s+(tool|mode)\b/i.test(query) || /\b(selection\s+tool\b)/i.test(query)

  if (drawRect) pushUnique({ kind: 'setDrawTool', tool: 'rectangle' })
  if (drawPoly) pushUnique({ kind: 'setDrawTool', tool: 'polygon' })
  if (drawCirc) pushUnique({ kind: 'setDrawTool', tool: 'circle' })
  if (drawSel) pushUnique({ kind: 'setDrawTool', tool: 'select' })
  if (drawRect || drawPoly || drawCirc) notes.push('Switched the map draw tool for AOI sketching.')
  if (drawSel) notes.push('Switched to selection / navigate mode.')

  /* Layer pick */
  if (wantsLayerChange(query) || (hasCommandCue(query) && extractLayerToken(query))) {
    const tok = extractLayerToken(query)
    if (tok && ctx.layerOptions.length) {
      const id = pickLayerIdForToken(ctx.layerOptions, tok.replace(/\s+/g, ''))
      if (id) {
        pushUnique({ kind: 'setWmsLayer', layerId: id })
        notes.push(`Set the RS layer to **${id}** (matched from your request).`)
      } else {
        return {
          handled: true,
          ok: false,
          reply: `Could not match **${tok}** to a loaded Sentinel/WMS layer. Open **Remote sensing** after layers load, or pick the layer from the dropdown.`,
        }
      }
    } else if (tok && !ctx.layerOptions.length) {
      return {
        handled: true,
        ok: false,
        reply:
          'Remote sensing layers are not loaded yet (empty WMS list). Connect Sentinel Hub / wait for GetCapabilities, then try the layer command again.',
      }
    }
  }

  /* Imagery (single) date */
  const imageryCue =
    /\b(imagery|scene|map)\s+date\b/i.test(query) ||
    /\b(single|snapshot|current)\s+date\b/i.test(query) ||
    /\bتاريخ\s+(الصورة|المشهد|الخريطة)/u.test(query)
  if (imageryCue || (/\bset\s+date\b/i.test(query) && !/\btime\s*series\b/i.test(query))) {
    const dates = collectIsoDates(query)
    if (dates[0]) {
      pushUnique({ kind: 'setImageryDate', iso: dates[0] })
      notes.push(`Set **Imagery date** to **${dates[0]}**.`)
    }
  }

  /* Time series range */
  if (/\btime\s*series\b/i.test(query) || /\bdate\s+range\b/i.test(query) || /\bseries\s+range\b/i.test(query) || /\bنطاق\s+زمني|سلسلة\s+زمنية/u.test(query)) {
    const dates = collectIsoDates(query)
    if (dates.length >= 2) {
      const [a, b] = dates[0]! <= dates[1]! ? [dates[0]!, dates[1]!] : [dates[1]!, dates[0]!]
      pushUnique({ kind: 'setTimeSeriesRange', start: a, end: b })
      notes.push(`Set **Time-series** range to **${a}** → **${b}**.`)
    } else if (/\bfrom\b/i.test(query) && dates.length === 1) {
      /* single date after "from" — insufficient */
    }
  }

  /* “from X to Y” without explicit cue — still treat as time series if two ISO dates */
  if (!effects.some(e => e.kind === 'setTimeSeriesRange')) {
    const dates = collectIsoDates(query)
    if (dates.length >= 2 && /\b(from|between|to|until|through)\b/i.test(query)) {
      const [a, b] = dates[0]! <= dates[1]! ? [dates[0]!, dates[1]!] : [dates[1]!, dates[0]!]
      pushUnique({ kind: 'setTimeSeriesRange', start: a, end: b })
      notes.push(`Set **Time-series** range to **${a}** → **${b}**.`)
    }
  }

  if (!effects.length) return { handled: false }

  if (!hasCommandCue(query) && !effects.some(e => e.kind === 'generateTimeline' || e.kind === 'stopTimeline')) {
    /* Layer/date changes require a command cue unless timeline-only */
    const onlyTimeline = effects.every(e => e.kind === 'generateTimeline' || e.kind === 'stopTimeline')
    if (!onlyTimeline) {
      const risky = effects.some(
        e =>
          e.kind === 'setWmsLayer' ||
          e.kind === 'setImageryDate' ||
          e.kind === 'setTimeSeriesRange' ||
          e.kind === 'setWmsOverlayVisible' ||
          e.kind === 'setDrawTool' ||
          e.kind === 'setStaticChartsOpen',
      )
      if (risky) return { handled: false }
    }
  }

  const reply =
    `### Remote sensing (toolbox)\n\n` +
    notes.map(l => `- ${l}`).join('\n') +
    `\n\n_Use the same phrasing to chain steps (layer → dates → **Generate timeline** / **Run analysis**)._`

  return { handled: true, ok: true, reply, effects }
}
