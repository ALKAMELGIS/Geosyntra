import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { extractGeoExplorerLayerHint, normalizeLayerName } from './geoExplorerLayerContext'

type GeoFeature = { properties?: Record<string, unknown> }

type ScopedData = {
  layers: GeoAiMapLayer[]
  features: Array<{ layerName: string; properties: Record<string, unknown> }>
  fields: string[]
}

type Comparison = {
  field: string
  op: '>' | '<' | '>=' | '<=' | '=' | '!='
  value: number
}

export type GeoAiStatsResult = {
  handled: boolean
  reply: string
}

function fcFromLayer(layer: GeoAiMapLayer): { features: GeoFeature[] } | null {
  const g = layer.geojson
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) return { features: g.features }
  const d = layer.data as { type?: string; features?: GeoFeature[] } | undefined
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) return { features: d.features }
  return null
}

function collectScope(query: string, layers: GeoAiMapLayer[]): ScopedData {
  const hint = extractGeoExplorerLayerHint(query, layers)
  let scoped = layers
  if (hint) {
    const hn = normalizeLayerName(hint)
    const subset = layers.filter(l => {
      const ln = normalizeLayerName(l.name)
      return ln === hn || ln.includes(hn) || hn.includes(ln)
    })
    if (subset.length) scoped = subset
  }

  const features: Array<{ layerName: string; properties: Record<string, unknown> }> = []
  const fieldSet = new Set<string>()
  for (const l of scoped) {
    const fc = fcFromLayer(l)
    if (!fc?.features?.length) continue
    for (const f of fc.features) {
      const props = f.properties
      if (!props || typeof props !== 'object') continue
      const p = props as Record<string, unknown>
      features.push({ layerName: l.name, properties: p })
      for (const k of Object.keys(p)) fieldSet.add(k)
    }
  }

  return { layers: scoped, features, fields: [...fieldSet] }
}

function findField(query: string, fields: string[]): string | null {
  const explicit =
    query.match(/\b(?:field|column|attribute)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1] ??
    query.match(/(?:حقل|عمود|سمة)\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    null
  if (explicit) {
    const f = fields.find(x => x.toLowerCase() === explicit.toLowerCase())
    if (f) return f
  }
  const q = query.toLowerCase()
  let best: string | null = null
  for (const f of fields) {
    const fl = f.toLowerCase()
    if (!fl || fl.length < 2) continue
    if (q.includes(fl) && (!best || fl.length > best.length)) best = f
  }
  return best
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseComparison(query: string, fields: string[]): Comparison | null {
  const sym = query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|=|>|<)\s*(-?\d+(?:\.\d+)?)/)
  if (sym) {
    const field = fields.find(f => f.toLowerCase() === sym[1].toLowerCase())
    if (field) return { field, op: sym[2] as Comparison['op'], value: Number(sym[3]) }
  }

  const ar =
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أكبر من أو يساوي|اكبر من او يساوي)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أصغر من أو يساوي|اصغر من او يساوي)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أكبر من|اكبر من)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أصغر من|اصغر من)\s*(-?\d+(?:\.\d+)?)/i)
  if (ar) {
    const field = fields.find(f => f.toLowerCase() === ar[1].toLowerCase())
    if (!field) return null
    const raw = ar[0]
    const op: Comparison['op'] = /يساوي/i.test(raw) ? (/أصغر|اصغر/i.test(raw) ? '<=' : '>=') : /أصغر|اصغر/i.test(raw) ? '<' : '>'
    return { field, op, value: Number(ar[2]) }
  }
  return null
}

function cmp(n: number, c: Comparison): boolean {
  if (c.op === '>') return n > c.value
  if (c.op === '<') return n < c.value
  if (c.op === '>=') return n >= c.value
  if (c.op === '<=') return n <= c.value
  if (c.op === '=') return n === c.value
  return n !== c.value
}

function selectRows(scope: ScopedData, comparison: Comparison | null) {
  if (!comparison) return scope.features
  return scope.features.filter(r => {
    const n = toNumber(r.properties[comparison.field])
    if (n == null) return false
    return cmp(n, comparison)
  })
}

function summarizeSelection(rows: Array<{ layerName: string; properties: Record<string, unknown> }>, limit = 6): string {
  if (!rows.length) return 'No matching records.'
  const lines = rows.slice(0, limit).map((r, i) => {
    const keys = Object.keys(r.properties).slice(0, 4)
    const sample = keys.map(k => `${k}=${String(r.properties[k] ?? '')}`).join(', ')
    return `${i + 1}. [${r.layerName}] ${sample}`
  })
  return lines.join('\n')
}

function safeEvalExpr(expr: string, props: Record<string, unknown>): number | null {
  const safe = expr.trim()
  if (!/^[A-Za-z0-9_+\-*/().\s]+$/.test(safe)) return null
  const replaced = safe.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, token => {
    const n = toNumber(props[token])
    return n == null ? '0' : String(n)
  })
  try {
    const out = Function(`"use strict"; return (${replaced});`)()
    return typeof out === 'number' && Number.isFinite(out) ? out : null
  } catch {
    return null
  }
}

export function runGeoAiStatsCommand(query: string, layers: GeoAiMapLayer[]): GeoAiStatsResult | null {
  const q = query.trim()
  if (!q) return null
  const hasStatIntent =
    /\b(sum|total|average|mean|min|max|count|group\s*by|statistics|summary|calculate field|select|selection|query)\b/i.test(q) ||
    /(?:مجموع|اجمالي|متوسط|أكبر|اكبر|أصغر|اصغر|عدد|إحصاء|احصاء|تحليل|تحديد|استعلام|group by|calculate field)/i.test(q)
  if (!hasStatIntent) return null

  const scope = collectScope(q, layers)
  if (!scope.features.length) {
    return { handled: true, reply: 'No loaded layer records are available for statistical analysis right now.' }
  }

  const comparison = parseComparison(q, scope.fields)
  const selected = selectRows(scope, comparison)
  const selectedCount = selected.length

  const calc = q.match(/calculate\s+field\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_+\-*/().\s]+)/i)
  if (calc) {
    const outField = calc[1]
    const expr = calc[2]
    const vals = selected
      .map(r => safeEvalExpr(expr, r.properties))
      .filter((v): v is number => v != null)
    const preview = vals.slice(0, 8).map((v, i) => `${i + 1}. ${outField} = ${v}`).join('\n')
    return {
      handled: true,
      reply: `Calculate Field preview (not persisted):\nExpression: ${outField} = ${expr}\nRows evaluated: ${vals.length}/${selectedCount}\n${preview || 'No numeric result rows.'}`,
    }
  }

  const groupByField =
    q.match(/\bgroup\s*by\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    q.match(/(?:حسب|تجميع حسب)\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    null
  if (groupByField) {
    const gb = scope.fields.find(f => f.toLowerCase() === groupByField.toLowerCase())
    if (!gb) return { handled: true, reply: `Group field "${groupByField}" was not found.` }
    const buckets = new Map<string, number>()
    for (const r of selected) {
      const k = String(r.properties[gb] ?? 'NULL')
      buckets.set(k, (buckets.get(k) ?? 0) + 1)
    }
    const lines = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([k, v]) => `- ${gb}=${k}: ${v}`)
      .join('\n')
    return { handled: true, reply: `Group By result (${selectedCount} rows):\n${lines || 'No groups.'}` }
  }

  const op =
    /\b(sum|total|مجموع|اجمالي)\b/i.test(q) ? 'sum' :
    /\b(average|mean|متوسط)\b/i.test(q) ? 'avg' :
    /\b(min|minimum|أصغر|اصغر|ادنى)\b/i.test(q) ? 'min' :
    /\b(max|maximum|أكبر|اكبر|اعلى)\b/i.test(q) ? 'max' :
    'count'

  const field = findField(q, scope.fields)

  if (op === 'count' && !field) {
    const whereTxt = comparison ? ` with filter ${comparison.field} ${comparison.op} ${comparison.value}` : ''
    return {
      handled: true,
      reply: `Selection count: ${selectedCount} records${whereTxt}.\nSample:\n${summarizeSelection(selected)}`,
    }
  }

  if (!field) return { handled: true, reply: 'Please specify a field name for this statistical operation.' }

  const nums = selected
    .map(r => toNumber(r.properties[field]))
    .filter((v): v is number => v != null)
  if (!nums.length) {
    return { handled: true, reply: `No numeric values found in field "${field}" for the current selection.` }
  }
  const sum = nums.reduce((a, b) => a + b, 0)
  const avg = sum / nums.length
  const min = Math.min(...nums)
  const max = Math.max(...nums)

  if (op === 'sum') return { handled: true, reply: `SUM(${field}) = ${sum}\nRows used: ${nums.length}/${selectedCount}` }
  if (op === 'avg') return { handled: true, reply: `AVG(${field}) = ${avg}\nRows used: ${nums.length}/${selectedCount}` }
  if (op === 'min') return { handled: true, reply: `MIN(${field}) = ${min}\nRows used: ${nums.length}/${selectedCount}` }
  if (op === 'max') return { handled: true, reply: `MAX(${field}) = ${max}\nRows used: ${nums.length}/${selectedCount}` }

  return {
    handled: true,
    reply: `COUNT(${field}) = ${nums.length}\nSelection rows: ${selectedCount}\nStatistics: SUM=${sum}, AVG=${avg}, MIN=${min}, MAX=${max}`,
  }
}
