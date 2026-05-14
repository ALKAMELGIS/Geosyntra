/**
 * Sentinel Hub WMS AOI EVALSCRIPT: discrete color ramps (piecewise linear between stops).
 * NDVI ramp matches common McFeeters-style classified visualization (Sentinel Playground / EO Browser style).
 */

/** [threshold, 0xRRGGBB] — thresholds ascending; color is anchor at each stop (lerp between). */
export type IndexRampStop = readonly [threshold: number, rgbHex: number]

/** User-provided NDVI classification (continuous spectrum → stepped classes). */
export const SI_NDVI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.5, 0x0c0c0c],
  [-0.2, 0xbfbfbf],
  [-0.1, 0xdbdbdb],
  [0, 0xeaeaea],
  [0.025, 0xfff9cc],
  [0.05, 0xede8b5],
  [0.075, 0xddd89b],
  [0.1, 0xccc682],
  [0.125, 0xbcb76b],
  [0.15, 0xafc160],
  [0.175, 0xa3cc59],
  [0.2, 0x91bf51],
  [0.25, 0x7fb247],
  [0.3, 0x70a33f],
  [0.35, 0x609635],
  [0.4, 0x4f892d],
  [0.45, 0x3f7c23],
  [0.5, 0x306d1c],
  [0.55, 0x216011],
  [0.6, 0x0f540a],
  [1, 0x004400],
] as const

/** NDWI (McFeeters): dry / bare → mixed → open water (blue ramp). */
export const SI_NDWI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-1.0, 0x1a0f0a],
  [-0.6, 0x4a2c1a],
  [-0.3, 0x8b5a2b],
  [-0.1, 0xc4a574],
  [0.0, 0xe8e2c6],
  [0.15, 0xb8dce8],
  [0.35, 0x5fa8d3],
  [0.55, 0x2a78b8],
  [0.75, 0x154f8f],
  [1.0, 0x0a2542],
] as const

/** GNDVI — same vegetation semantics as NDVI ramp. */
export const SI_GNDVI_CLASSIFICATION_STOPS = SI_NDVI_CLASSIFICATION_STOPS

/** NDMI (NIR–SWIR moisture): dry → intermediate → high moisture. */
export const SI_NDMI_CLASSIFICATION_STOPS: readonly IndexRampStop[] = [
  [-0.6, 0x2d0a0a],
  [-0.3, 0x6b2f12],
  [0.0, 0xb8892e],
  [0.15, 0xd9c96a],
  [0.3, 0xa8c878],
  [0.45, 0x5ea86a],
  [0.6, 0x2d7a4e],
  [0.75, 0x1a5a3c],
  [1.0, 0x0d3a28],
] as const

/** EVI — similar interpretability to NDVI for legend / ramp. */
export const SI_EVI_CLASSIFICATION_STOPS = SI_NDVI_CLASSIFICATION_STOPS

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
