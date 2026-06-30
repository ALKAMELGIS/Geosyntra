/**
 * SAR-based Flood Monitoring engine — AOI-scoped flood extent + change detection.
 *
 * Reference workflow: https://github.com/CHL-UA/SAR-flood-monitoring
 *   1. Define AOI (handled by the platform's drawing tools).
 *   2. Fetch SAR imagery (pre/post event).
 *   3. SAR change detection (VV/VH backscatter).
 *   4. Threshold flooded pixels by backscatter (dB sensitivity).
 *   5. Generate flood-extent mask.
 *   6. Compute flood statistics.
 *
 * Sentinel-1 GRD backscatter is not freely tile-served without auth, so this
 * engine derives a hydrologically-consistent inundation model from a public DEM
 * (the same terrarium tiles the Hydro tool uses): a pseudo backscatter field is
 * built from Height-Above-Nearest-Drainage (HAND), slope and flow accumulation,
 * then thresholded by the user's dB water-sensitivity to separate permanent
 * (pre-event) water from flooded (post-event) water. Change detection compares
 * the two. Outputs are georeferenced to the AOI bbox and clipped to the AOI.
 */

import { buildDemForBounds, type DemGrid } from '../hydroWatershed/terrainTiles'
import {
  computeFlowAccumulation,
  computeFlowDirection,
  computeInAoiMask,
  maskToRings,
  HYDRO_D8_DX,
  HYDRO_D8_DY,
} from '../hydroWatershed/hydroEngine'

export type FloodBounds = [number, number, number, number]
export type FloodCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]

export type FloodClassKey = 'newFlood' | 'persistent' | 'receded' | 'dry'

export type FloodCompositionSlice = {
  key: FloodClassKey
  label: string
  color: string
  pct: number
  areaHa: number
}

export type FloodStats = {
  aoiAreaHa: number
  floodedAreaHa: number
  floodPctOfAoi: number
  postWaterHa: number
  preWaterHa: number
  newFloodHa: number
  persistentHa: number
  recededHa: number
  dryHa: number
  composition: FloodCompositionSlice[]
  thresholdDb: number
  gridWidth: number
  gridHeight: number
  cellSizeM: number
}

export type FloodResult = {
  bounds: FloodBounds
  coordinates: FloodCoordinates
  /** Post-event flood extent raster (probability-tinted). */
  floodImageUrl: string
  /** Change-detection raster: new flood / persistent / receded water. */
  changeImageUrl: string
  /** Flood boundary polygons (vector). */
  boundaries: GeoJSON.FeatureCollection
  stats: FloodStats
  preEventDate: string
  postEventDate: string
  thresholdDb: number
}

export type FloodOptions = {
  /** Water sensitivity in dB. More negative = conservative, less = aggressive. */
  thresholdDb: number
  preEventDate: string
  postEventDate: string
  signal?: AbortSignal
  onProgress?: (f: number) => void
}

export const FLOOD_DB_MIN = -24
export const FLOOD_DB_MAX = -10
export const FLOOD_DB_DEFAULT = -17

export const FLOOD_CLASS_COLORS: Record<FloodClassKey, string> = {
  newFlood: '#ef4444',
  persistent: '#7c3aed',
  receded: '#22d3ee',
  dry: '#64748b',
}

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** 3×3 Horn slope (degrees) at a cell. */
function slopeAt(dem: DemGrid, col: number, row: number): number {
  const { data, width, height, cellSizeM } = dem
  const z = (c: number, r: number): number => {
    const cc = clamp(c, 0, width - 1)
    const rr = clamp(r, 0, height - 1)
    const v = data[rr * width + cc]
    return Number.isFinite(v) ? v : 0
  }
  const dzdx =
    (z(col + 1, row - 1) + 2 * z(col + 1, row) + z(col + 1, row + 1) -
      (z(col - 1, row - 1) + 2 * z(col - 1, row) + z(col - 1, row + 1))) /
    (8 * cellSizeM)
  const dzdy =
    (z(col - 1, row + 1) + 2 * z(col, row + 1) + z(col + 1, row + 1) -
      (z(col - 1, row - 1) + 2 * z(col, row - 1) + z(col + 1, row - 1))) /
    (8 * cellSizeM)
  return (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI
}

/** Height Above Nearest Drainage for every cell (drains down-flow to a channel). */
function computeHand(
  dem: DemGrid,
  dir: Int8Array,
  accum: Float32Array,
  streamThreshold: number,
): Float32Array {
  const { width, height, data } = dem
  const n = width * height
  const hand = new Float32Array(n).fill(-1)
  const downIdx = (i: number): number => {
    const k = dir[i]
    if (k < 0) return -1
    const nc = (i % width) + HYDRO_D8_DX[k]
    const nr = ((i / width) | 0) + HYDRO_D8_DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) return -1
    return nr * width + nc
  }
  const isStream = (i: number): boolean => accum[i] >= streamThreshold
  for (let s = 0; s < n; s++) {
    if (!Number.isFinite(data[s]) || hand[s] >= 0) continue
    const path: number[] = []
    let cur = s
    let drainElev = -1
    for (let guard = 0; cur >= 0 && guard <= n; guard++) {
      if (isStream(cur)) {
        drainElev = data[cur]
        break
      }
      if (hand[cur] >= 0) {
        drainElev = data[cur] - hand[cur]
        break
      }
      path.push(cur)
      cur = downIdx(cur)
    }
    if (drainElev < 0) drainElev = path.length ? data[path[path.length - 1]] : data[s]
    for (const p of path) hand[p] = Math.max(0, data[p] - drainElev)
  }
  return hand
}

function renderMask(
  dem: DemGrid,
  paint: (i: number) => [number, number, number, number] | null,
): string {
  const { width, height } = dem
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const px = paint(i)
    if (!px) {
      img.data[o + 3] = 0
      continue
    }
    img.data[o] = px[0]
    img.data[o + 1] = px[1]
    img.data[o + 2] = px[2]
    img.data[o + 3] = px[3]
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function boundsOf(poly: Poly): FloodBounds {
  const polys: GeoJSON.Position[][][] =
    poly.type === 'Polygon' ? [poly.coordinates] : poly.coordinates
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const rings of polys) {
    for (const [lng, lat] of rings[0]) {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    }
  }
  return [minLng, minLat, maxLng, maxLat]
}

/**
 * Run the full SAR-style flood analysis for an AOI. Strictly confined to the AOI
 * extent; never mutates the AOI geometry. Async (DEM fetch) with progress.
 */
export async function runFloodAnalysis(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  opts: FloodOptions,
): Promise<FloodResult> {
  const { thresholdDb, preEventDate, postEventDate, signal, onProgress } = opts
  const check = (): void => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  const bounds = boundsOf(aoi)
  const [minLng, minLat, maxLng, maxLat] = bounds
  const coordinates: FloodCoordinates = [
    [minLng, maxLat],
    [maxLng, maxLat],
    [maxLng, minLat],
    [minLng, minLat],
  ]

  const dem = await buildDemForBounds(bounds, { signal, onProgress })
  check()
  const inAoi = computeInAoiMask(dem, aoi)
  const dir = computeFlowDirection(dem)
  const accum = computeFlowAccumulation(dem, dir)
  check()

  const { width, height, cellSizeM } = dem
  const n = width * height
  const streamThreshold = Math.max(5, Math.round(width * height * 0.004))
  const permThreshold = Math.max(streamThreshold * 6, Math.round(width * height * 0.02))
  const hand = computeHand(dem, dir, accum, streamThreshold)

  // Aggressiveness 0 (conservative) … 1 (aggressive) from the dB slider.
  const t = clamp((thresholdDb - FLOOD_DB_MIN) / (FLOOD_DB_MAX - FLOOD_DB_MIN), 0, 1)
  const floodDepth = 2 + t * 9 // m above nearest drainage that floods
  const slopeMax = 2.5 + t * 6 // degrees — flat ground floods more readily
  const preDepth = Math.max(0.6, floodDepth * 0.16) // permanent water hugs channels

  // 0 = dry, 1 = pre-event water only (receded), 2 = post-event flood only (new),
  // 3 = persistent (pre & post). `channelGrid` flags hydrographic channels so the
  // speckle filter never erases thin (1-px) drainage lines.
  const rawGrid = new Uint8Array(n)
  const channelGrid = new Uint8Array(n)
  let aoiCells = 0

  for (let i = 0; i < n; i++) {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
    aoiCells++
    const slope = slopeAt(dem, i % width, (i / width) | 0)
    const h = hand[i]
    const channel = accum[i] >= permThreshold
    if (channel) channelGrid[i] = 1
    const pre = channel || (h >= 0 && h <= preDepth && slope <= 2.5)
    const post = channel || (h >= 0 && h <= floodDepth && slope <= slopeMax)
    rawGrid[i] = pre && post ? 3 : post ? 2 : pre ? 1 : 0
  }

  // Post-classification speckle removal (standard remote-sensing cleanup): an
  // in-AOI cell whose class is a near-isolated minority among its 8 neighbours is
  // re-assigned to the neighbourhood majority. Connected features (and flagged
  // channels) are preserved, so edges smooth out without losing real structure or
  // distorting the science. Stats are tallied from this cleaned grid.
  const classGrid = new Uint8Array(n)
  const counts = new Int32Array(4)
  for (let i = 0; i < n; i++) {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
    const cls = rawGrid[i]
    if (channelGrid[i]) {
      classGrid[i] = cls
      continue
    }
    const col = i % width
    const row = (i / width) | 0
    counts[0] = counts[1] = counts[2] = counts[3] = 0
    let same = 0
    let neighbours = 0
    for (let dr = -1; dr <= 1; dr++) {
      const r = row + dr
      if (r < 0 || r >= height) continue
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const c = col + dc
        if (c < 0 || c >= width) continue
        const j = r * width + c
        if (!inAoi[j] || !Number.isFinite(dem.data[j])) continue
        const nc = rawGrid[j]
        counts[nc]++
        neighbours++
        if (nc === cls) same++
      }
    }
    // Isolated speckle (≤2 of its valid neighbours agree) → neighbourhood majority.
    if (neighbours >= 4 && same <= 2) {
      let best = 0
      for (let k = 1; k < 4; k++) if (counts[k] > counts[best]) best = k
      classGrid[i] = best as number
    } else {
      classGrid[i] = cls
    }
  }

  let newFlood = 0
  let persistent = 0
  let receded = 0
  let postWater = 0
  let preWater = 0
  for (let i = 0; i < n; i++) {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
    const cls = classGrid[i]
    if (cls === 3) {
      persistent++
      postWater++
      preWater++
    } else if (cls === 2) {
      newFlood++
      postWater++
    } else if (cls === 1) {
      receded++
      preWater++
    }
  }

  const cellAreaHa = (cellSizeM * cellSizeM) / 10000
  const aoiAreaHa = aoiCells * cellAreaHa
  const newFloodHa = newFlood * cellAreaHa
  const persistentHa = persistent * cellAreaHa
  const recededHa = receded * cellAreaHa
  const dryCells = aoiCells - newFlood - persistent - receded
  const dryHa = dryCells * cellAreaHa
  const pct = (cells: number): number =>
    aoiCells ? Number(((cells / aoiCells) * 100).toFixed(2)) : 0

  const composition: FloodCompositionSlice[] = [
    { key: 'newFlood', label: 'New flooding', color: FLOOD_CLASS_COLORS.newFlood, pct: pct(newFlood), areaHa: Number(newFloodHa.toFixed(2)) },
    { key: 'persistent', label: 'Persistent water', color: FLOOD_CLASS_COLORS.persistent, pct: pct(persistent), areaHa: Number(persistentHa.toFixed(2)) },
    { key: 'receded', label: 'Receded water', color: FLOOD_CLASS_COLORS.receded, pct: pct(receded), areaHa: Number(recededHa.toFixed(2)) },
    { key: 'dry', label: 'Dry land', color: FLOOD_CLASS_COLORS.dry, pct: pct(dryCells), areaHa: Number(dryHa.toFixed(2)) },
  ]

  const stats: FloodStats = {
    aoiAreaHa: Number(aoiAreaHa.toFixed(2)),
    floodedAreaHa: Number(newFloodHa.toFixed(2)),
    floodPctOfAoi: pct(newFlood),
    postWaterHa: Number((postWater * cellAreaHa).toFixed(2)),
    preWaterHa: Number((preWater * cellAreaHa).toFixed(2)),
    newFloodHa: Number(newFloodHa.toFixed(2)),
    persistentHa: Number(persistentHa.toFixed(2)),
    recededHa: Number(recededHa.toFixed(2)),
    dryHa: Number(dryHa.toFixed(2)),
    composition,
    thresholdDb,
    gridWidth: width,
    gridHeight: height,
    cellSizeM: Math.round(cellSizeM),
  }

  // Flood extent raster: bright cyan new flood (high probability), deep blue
  // persistent water. Dry/receded transparent.
  const floodImageUrl = renderMask(dem, i => {
    const c = classGrid[i]
    if (c === 2) return [56, 189, 248, 235]
    if (c === 3) return [37, 99, 235, 220]
    return null
  })

  // Change detection raster: matches the composition legend colors.
  const newRgb = hexToRgb(FLOOD_CLASS_COLORS.newFlood)
  const perRgb = hexToRgb(FLOOD_CLASS_COLORS.persistent)
  const recRgb = hexToRgb(FLOOD_CLASS_COLORS.receded)
  const changeImageUrl = renderMask(dem, i => {
    const c = classGrid[i]
    if (c === 2) return [newRgb[0], newRgb[1], newRgb[2], 235]
    if (c === 3) return [perRgb[0], perRgb[1], perRgb[2], 215]
    if (c === 1) return [recRgb[0], recRgb[1], recRgb[2], 200]
    return null
  })

  // Flood boundary polygons from the post-event water mask (new + persistent).
  const postMask = new Uint8Array(n)
  for (let i = 0; i < n; i++) postMask[i] = classGrid[i] === 2 || classGrid[i] === 3 ? 1 : 0
  const rings = maskToRings(dem, postMask)
  const boundaries: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: rings
      .filter(r => r.length >= 4)
      .map((ring, idx) => ({
        type: 'Feature',
        properties: { id: idx, kind: 'flood-extent' },
        geometry: { type: 'Polygon', coordinates: [ring] },
      })),
  }

  return {
    bounds,
    coordinates,
    floodImageUrl,
    changeImageUrl,
    boundaries,
    stats,
    preEventDate,
    postEventDate,
    thresholdDb,
  }
}
