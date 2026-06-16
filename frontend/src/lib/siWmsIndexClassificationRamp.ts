/**
 * Sentinel Hub WMS AOI EVALSCRIPT: adaptive spectral color ramps (piecewise linear between stops).
 * NDVI: water (negative) → aqua/blue; dry soil → brown/yellow; vegetation → green gradient.
 * NDWI: dry land → earth tones; water → cyan → deep blue with high contrast.
 */

/** [threshold, 0xRRGGBB] — thresholds ascending; color is anchor at each stop (lerp between). */
export type IndexRampStop = readonly [threshold: number, rgbHex: number]

/**
 * NDVI (B08/B04) — Adaptive Spectral Color Ramp:
 * • Water (idx < 0): aqua → deep blue by depth (auto-detected within NDVI)
 * • Dry soil / bare: brown / sandy yellow (idx ≈ 0 … 0.15)
 * • Vegetation: smooth yellow-green → dense forest green (idx > 0.15)
 */
export const SI_NDVI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x0c4a6e],
  [-0.42, 0x075985],
  [-0.35, 0x0369a1],
  [-0.28, 0x0284c7],
  [-0.2, 0x0ea5e9],
  [-0.15, 0x22d3ee],
  [-0.1, 0x67e8f9],
  [-0.05, 0x7dd3fc],
  [-0.02, 0x9ecae6],
  [0, 0xc4a574],
  [0.05, 0xb8956b],
  [0.1, 0xd4a574],
  [0.15, 0xe8c872],
  [0.2, 0xc5d86a],
  [0.25, 0xa3c451],
  [0.3, 0x7cb342],
  [0.35, 0x66bb6a],
  [0.4, 0x4caf50],
  [0.45, 0x43a047],
  [0.5, 0x388e3c],
  [0.55, 0x2e7d32],
  [0.6, 0x27632a],
  [0.7, 0x1b5e20],
  [0.85, 0x14532d],
  [1, 0x0a3d1a],
] as const

/**
 * NDWI (B03/B08) — Water Spectrum Color Ramp:
 * • Dry land: brown / grey earth tones
 * • Shallow water: light cyan
 * • Medium water: medium blue
 * • Deep water: dark navy blue (enhanced edge contrast)
 */
export const SI_NDWI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.8, 0x3d2817],
  [-0.6, 0x6b4423],
  [-0.4, 0x8b7355],
  [-0.2, 0xa89f8f],
  [0, 0xc8c4b8],
  [0.1, 0x9ecae6],
  [0.2, 0x7dd3fc],
  [0.3, 0x38bdf8],
  [0.4, 0x0ea5e9],
  [0.5, 0x0284c7],
  [0.6, 0x0369a1],
  [0.7, 0x1d4ed8],
  [0.8, 0x1e3a8a],
  [1, 0x0c1929],
] as const

/** Human-readable bins for NDWI legend rows (dry land → deep water). */
export const SI_NDWI_CLASS_LABELS: readonly string[] = [
  'Very dry / bare land',
  'Dry soil',
  'Semi-arid surface',
  'Low moisture land',
  'Transition / mixed',
  'Wetland fringe',
  'Shallow water (cyan)',
  'Shallow-medium water',
  'Medium water (blue)',
  'Deep water',
  'Very deep water (navy)',
]

/**
 * GNDVI — adaptive: water blues (negative) → soil ochre → chlorophyll greens.
 */
export const SI_GNDVI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x0c4a6e],
  [-0.3, 0x0284c7],
  [-0.15, 0x22d3ee],
  [-0.05, 0x9ecae6],
  [0, 0xc4a574],
  [0.1, 0xd4a574],
  [0.2, 0xc5d86a],
  [0.35, 0x7cb342],
  [0.5, 0x43a047],
  [0.7, 0x1b5e20],
  [1, 0x0a3d1a],
] as const

/**
 * NDMI — moisture: deep water blue (very dry/water bodies) → dry red-brown → moist green.
 */
export const SI_NDMI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.6, 0x0c4a6e],
  [-0.45, 0x0369a1],
  [-0.3, 0x6b2f12],
  [-0.15, 0xb8892e],
  [0.0, 0xd9c96a],
  [0.15, 0xa8c878],
  [0.3, 0x5ea86a],
  [0.45, 0x2d7a4e],
  [0.6, 0x1a5a3c],
  [0.75, 0x14532d],
  [1.0, 0x0a3d1a],
] as const

/**
 * EVI — water blues (low) → soil yellow → teal → emerald canopy.
 */
export const SI_EVI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x0c4a6e],
  [-0.25, 0x0284c7],
  [-0.1, 0x67e8f9],
  [0, 0xd4a574],
  [0.1, 0xe8c872],
  [0.2, 0x5eead4],
  [0.4, 0x14b8a6],
  [0.6, 0x059669],
  [1, 0x064e3b],
] as const

/**
 * SAVI — soil-adjusted: water blues → bare ochre → olive → canopy green.
 */
export const SI_SAVI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x0c4a6e],
  [-0.25, 0x0ea5e9],
  [-0.05, 0x9ecae6],
  [0, 0xc4a574],
  [0.1, 0xd97706],
  [0.2, 0xca8a04],
  [0.35, 0x84cc16],
  [0.5, 0x65a30d],
  [0.65, 0x3f6212],
  [0.8, 0x166534],
  [1, 0x052e16],
] as const

/** NDBI — built-up: vegetation green low → grey mix → urban magenta-red. */
export const SI_NDBI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x14532d],
  [-0.2, 0x4ade80],
  [0, 0x9ca3af],
  [0.2, 0x6b7280],
  [0.4, 0xa855f7],
  [0.6, 0xdb2777],
  [1, 0x831843],
] as const

/** LST proxy — cool blue → warm yellow → hot red. */
export const SI_LST_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-1, 0x1e3a8a],
  [-0.5, 0x3b82f6],
  [-0.2, 0x67e8f9],
  [0, 0xfef08a],
  [0.25, 0xfbbf24],
  [0.5, 0xf97316],
  [0.75, 0xef4444],
  [1, 0x7f1d1d],
] as const

export function siFormatHex6(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}

/** Pairs of consecutive stops for map legend rows. */
export function siRampLegendSegments(stops: readonly IndexRampStop[]): Array<{
  from: number
  to: number
  color: string
}> {
  const out: Array<{ from: number; to: number; color: string }> = []
  for (let i = 1; i < stops.length; i += 1) {
    const t0 = stops[i - 1]![0]
    const [t1, h1] = stops[i]!
    out.push({ from: t0, to: t1, color: siFormatHex6(h1) })
  }
  return out
}

/** CSS `linear-gradient(to top, …)` matching the classified ramp (high index at top). */
export function siStopsToVerticalCssGradient(stops: readonly IndexRampStop[]): string {
  const t0 = stops[0]![0]
  const t1 = stops[stops.length - 1]![0]
  const span = Math.abs(t1 - t0) < 1e-9 ? 1 : t1 - t0
  const parts = stops.map(([t, h]) => {
    const p = ((t - t0) / span) * 100
    const clamped = Math.max(0, Math.min(100, p))
    return `${siFormatHex6(h)} ${clamped.toFixed(2)}%`
  })
  return `linear-gradient(to top, ${parts.join(', ')})`
}

/** Fewer table rows for dense ramps (always includes last class). */
export function siThinLegendSegments(
  stops: readonly IndexRampStop[],
  maxRows: number,
): Array<{ from: number; to: number; color: string }> {
  const all = siRampLegendSegments(stops)
  if (all.length <= maxRows) return all
  const step = Math.ceil(all.length / maxRows)
  const out = all.filter((_, i) => i % step === 0)
  const last = all[all.length - 1]!
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/** Sentinel Hub evalscript literal: `[[-0.5,0x0c0c0c],...]` */
export function siRampStopsToEvalScriptArrayLiteral(stops: readonly IndexRampStop[]): string {
  return `[${stops.map(([t, h]) => `[${t},${h}]`).join(',')}]`
}

function unpackRgbHex(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
}

function packRgbHex(r: number, g: number, b: number): number {
  const R = Math.max(0, Math.min(255, Math.round(r * 255)))
  const G = Math.max(0, Math.min(255, Math.round(g * 255)))
  const B = Math.max(0, Math.min(255, Math.round(b * 255)))
  return (R << 16) | (G << 8) | B
}

/** Sample piecewise-linear ramp color at threshold `t`. */
export function siSampleRampColorAt(stops: readonly IndexRampStop[], t: number): number {
  const n = stops.length
  if (n === 0) return 0
  if (t <= stops[0]![0]) return stops[0]![1]
  if (t >= stops[n - 1]![0]) return stops[n - 1]![1]
  for (let i = 1; i < n; i++) {
    const t1 = stops[i]![0]
    if (t <= t1) {
      const t0 = stops[i - 1]![0]
      const c0 = unpackRgbHex(stops[i - 1]![1])
      const c1 = unpackRgbHex(stops[i]![1])
      const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 + 1e-12)))
      return packRgbHex(
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      )
    }
  }
  return stops[n - 1]![1]
}

/**
 * Resample a scientific ramp to exactly `stopCount` thresholds (N classes ⇒ N+1 stops).
 * Preserves per-index colors — used for Live 10-class WMS tiles + legends.
 */
export function siWmsResampleRampToClassCount(
  stops: readonly IndexRampStop[],
  stopCount: number,
): IndexRampStop[] {
  if (stops.length < 2) return [...stops]
  const k = Math.max(2, Math.round(stopCount))
  if (k === stops.length) return [...stops]
  const t0 = stops[0]![0]
  const t1 = stops[stops.length - 1]![0]
  const out: IndexRampStop[] = []
  for (let i = 0; i < k; i++) {
    const u = k <= 1 ? 0 : i / (k - 1)
    const t = t0 + (t1 - t0) * u
    out.push([t, siSampleRampColorAt(stops, t)])
  }
  return out
}
