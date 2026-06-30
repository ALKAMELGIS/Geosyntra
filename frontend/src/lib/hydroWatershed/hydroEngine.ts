/**
 * Hydro Watershed engine — terrain-analysis pipeline for an AOI.
 *
 * Pipeline (all derived from a DEM sampled over the AOI bounding box and clipped
 * to the AOI polygon):
 *   1. Extract AOI boundary  → in-AOI cell mask
 *   2. Generate DEM           → elevation grid + hypsometric/hillshade raster
 *   3. Flow direction & accumulation (D8)
 *   4. Streams / drainage network (contributing-area threshold) → vector
 *   5. Watershed delineation (largest-accumulation outlet)       → vector
 *   6. Hydrological mesh/grid                                     → vector
 *
 * Outputs are georeferenced to the AOI bbox; rasters are PNG data URLs masked to
 * the AOI, vectors are GeoJSON FeatureCollections.
 */

import { buildDemForBounds, type DemGrid } from './terrainTiles'
import { metersPerDegreeLng, METERS_PER_DEGREE_LAT } from './webMercatorTiles'

export type HydroBounds = [number, number, number, number]

export type HydroStageKey =
  | 'aoi'
  | 'dem'
  | 'slope'
  | 'flowDir'
  | 'flowAccum'
  | 'streams'
  | 'wetness'
  | 'flood'
  | 'basin'
  | 'watershed'

export type HydroElevationBand = {
  name: string
  pct: number
  areaHa: number
  color: string
}

/**
 * Statistics accumulate per stage, so every field is optional: the DEM stage
 * fills elevation/slope/bands, streams fills stream metrics, watershed fills
 * basin metrics. Consumers must guard for `undefined`.
 */
export type HydroStats = {
  elevMin?: number
  elevMax?: number
  elevMean?: number
  reliefM?: number
  meanSlopeDeg?: number
  maxSlopeDeg?: number
  streamLengthKm?: number
  streamCells?: number
  /** Number of individual drainage-link segments. */
  streamSegments?: number
  /** Highest Strahler order present in the drainage network. */
  maxStreamOrder?: number
  /** Highest Shreve magnitude present in the drainage network. */
  maxShreveMagnitude?: number
  meanWetness?: number
  floodAreaHa?: number
  floodPctOfAoi?: number
  basinCount?: number
  watershedAreaHa?: number
  watershedAreaKm2?: number
  /** Watershed outlet (pour point) as [lng, lat]. */
  watershedOutlet?: [number, number] | null
  aoiAreaHa?: number
  watershedPctOfAoi?: number
  /** Hillshade illumination parameters (degrees). */
  sunAzimuthDeg?: number
  sunAltitudeDeg?: number
  /** Peak D8 flow accumulation (max contributing cells). */
  maxContributingCells?: number
  cellSizeM?: number
  gridWidth?: number
  gridHeight?: number
  elevationBands?: HydroElevationBand[]
}

export type HydroCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]

/**
 * Outputs are partial: each stage can run independently and fills only its own
 * field(s). `bounds`/`coordinates` are always present once a context exists.
 */
export type HydroResult = {
  bounds: HydroBounds
  /** Image-source corner coordinates (TL, TR, BR, BL). */
  coordinates: HydroCoordinates
  demImageUrl?: string
  /** Slope raster (degrees) — green flat → red steep. */
  slopeImageUrl?: string
  /** D8 flow-direction raster (8-hue) — companion to flow accumulation. */
  flowDirImageUrl?: string
  flowAccumImageUrl?: string
  streams?: GeoJSON.FeatureCollection
  /** Topographic Wetness Index raster — dry → wet. */
  wetnessImageUrl?: string
  /** Flood-susceptibility raster (HAND) — low → high. */
  floodImageUrl?: string
  /** Drainage-basin partition raster — classified into the 5 main basins. */
  basinImageUrl?: string
  watershed?: GeoJSON.FeatureCollection
  stats: HydroStats
}

type Poly = GeoJSON.Polygon | GeoJSON.MultiPolygon

// D8 neighbour offsets (E, SE, S, SW, W, NW, N, NE) with distance weights.
export const HYDRO_D8_DX = [1, 1, 0, -1, -1, -1, 0, 1]
export const HYDRO_D8_DY = [0, 1, 1, 1, 0, -1, -1, -1]
const DX = HYDRO_D8_DX
const DY = HYDRO_D8_DY
const DDIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2]

/* ── geometry helpers ─────────────────────────────────────────────────────── */

function pointInRing(lng: number, lat: number, ring: GeoJSON.Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, geom: Poly): boolean {
  const polys: GeoJSON.Position[][][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  for (const rings of polys) {
    if (!rings.length) continue
    if (!pointInRing(lng, lat, rings[0])) continue
    let inHole = false
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lng, lat, rings[h])) {
        inHole = true
        break
      }
    }
    if (!inHole) return true
  }
  return false
}

function ringAreaM2(ring: GeoJSON.Position[]): number {
  const R = 6378137
  const n = ring.length
  if (n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % n]
    total +=
      ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180))
  }
  return Math.abs((total * R * R) / 2)
}

function polygonAreaHa(geom: Poly): number {
  const polys: GeoJSON.Position[][][] =
    geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let m2 = 0
  for (const rings of polys) {
    rings.forEach((ring, i) => {
      const a = ringAreaM2(ring)
      m2 += i === 0 ? a : -a
    })
  }
  return Math.max(0, m2) / 10000
}

/* ── colour helpers ───────────────────────────────────────────────────────── */

type RGB = [number, number, number]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function rampColor(stops: Array<{ t: number; c: RGB }>, t: number): RGB {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].t) {
      const a = stops[i - 1]
      const b = stops[i]
      const f = (x - a.t) / (b.t - a.t || 1)
      return [lerp(a.c[0], b.c[0], f), lerp(a.c[1], b.c[1], f), lerp(a.c[2], b.c[2], f)]
    }
  }
  return stops[stops.length - 1].c
}

const HYPSOMETRIC: Array<{ t: number; c: RGB }> = [
  { t: 0, c: [38, 92, 66] },
  { t: 0.3, c: [122, 139, 58] },
  { t: 0.55, c: [194, 168, 90] },
  { t: 0.75, c: [156, 107, 63] },
  { t: 0.9, c: [138, 107, 90] },
  { t: 1, c: [244, 244, 244] },
]

const FLOW_RAMP: Array<{ t: number; c: RGB }> = [
  { t: 0, c: [10, 77, 140] },
  { t: 0.6, c: [0, 200, 255] },
  { t: 1, c: [235, 255, 255] },
]

const SLOPE_RAMP: Array<{ t: number; c: RGB }> = [
  { t: 0, c: [33, 150, 83] },
  { t: 0.35, c: [180, 214, 64] },
  { t: 0.6, c: [245, 193, 22] },
  { t: 0.8, c: [240, 120, 40] },
  { t: 1, c: [214, 40, 40] },
]

// Dry (warm tan) → wet (deep blue) for Topographic Wetness Index.
const WETNESS_RAMP: Array<{ t: number; c: RGB }> = [
  { t: 0, c: [150, 120, 70] },
  { t: 0.4, c: [120, 170, 150] },
  { t: 0.7, c: [40, 150, 220] },
  { t: 1, c: [20, 70, 200] },
]

// Flood susceptibility (HAND): high (bright cyan) → low (deep blue).
const FLOOD_RAMP: Array<{ t: number; c: RGB }> = [
  { t: 0, c: [12, 60, 150] },
  { t: 0.5, c: [40, 150, 235] },
  { t: 1, c: [120, 240, 255] },
]

// Categorical palette for drainage basins (cycled).
const BASIN_PALETTE: RGB[] = [
  [233, 69, 96],
  [56, 176, 222],
  [120, 220, 120],
  [255, 184, 60],
  [168, 122, 245],
  [255, 122, 182],
  [70, 214, 196],
  [196, 160, 90],
  [120, 150, 255],
  [240, 110, 70],
]

/** Generic AOI-clipped raster renderer: `paint(i)` returns RGBA or null (transparent). */
function renderCellRaster(
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

/* ── DEM-derived computations ─────────────────────────────────────────────── */

export function computeInAoiMask(dem: DemGrid, aoi: Poly): Uint8Array {
  const { width, height, lngs, lats } = dem
  const mask = new Uint8Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      mask[row * width + col] = pointInPolygon(lngs[col], lats[row], aoi) ? 1 : 0
    }
  }
  return mask
}

/**
 * Binary min-heap keyed by a numeric priority, storing a parallel integer payload
 * (a cell index). Used by the Priority-Flood depression fill.
 */
class MinHeap {
  private prio: number[] = []
  private val: number[] = []
  size = 0

  push(priority: number, value: number): void {
    this.prio.push(priority)
    this.val.push(value)
    this.size++
    let i = this.size - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.prio[p] <= this.prio[i]) break
      this.swap(i, p)
      i = p
    }
  }

  pop(): number {
    const top = this.val[0]
    this.size--
    if (this.size > 0) {
      this.prio[0] = this.prio[this.size]
      this.val[0] = this.val[this.size]
    }
    this.prio.pop()
    this.val.pop()
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = i * 2 + 2
      let s = i
      if (l < this.size && this.prio[l] < this.prio[s]) s = l
      if (r < this.size && this.prio[r] < this.prio[s]) s = r
      if (s === i) break
      this.swap(i, s)
      i = s
    }
    return top
  }

  private swap(a: number, b: number): void {
    const tp = this.prio[a]
    this.prio[a] = this.prio[b]
    this.prio[b] = tp
    const tv = this.val[a]
    this.val[a] = this.val[b]
    this.val[b] = tv
  }
}

/**
 * Depression-filled elevation (Priority-Flood + epsilon, Barnes et al. 2014).
 *
 * Raw DEMs sampled at coarse resolution are riddled with spurious pits and flats;
 * routing D8 flow over them fragments drainage into thousands of tiny disconnected
 * pieces (accumulation never builds, streams never reach their threshold, and the
 * watershed can't close). Priority-Flood floods inward from the grid border / the
 * no-data edge, raising every cell to at least the lowest already-processed cell on
 * its path plus a tiny epsilon. This removes all pits and imposes a faint monotonic
 * gradient across flats, so every valid cell has a guaranteed downslope path to the
 * edge — yielding connected channels, realistic accumulation and a closed basin.
 *
 * Returns a new elevation array (NaN where the source is no-data); the original DEM
 * is preserved for elevation/slope/hillshade display.
 */
export function fillDepressions(dem: DemGrid): Float32Array {
  const { data, width, height } = dem
  const n = width * height
  const filled = new Float32Array(n)
  const closed = new Uint8Array(n)
  const heap = new MinHeap()
  // Epsilon enforces drainage across flats without visibly altering elevations.
  const EPS = 1e-3
  const valid = (i: number): boolean => Number.isFinite(data[i])

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col
      if (!valid(i)) {
        filled[i] = NaN
        closed[i] = 1
        continue
      }
      let seed = row === 0 || col === 0 || row === height - 1 || col === width - 1
      for (let k = 0; k < 8 && !seed; k++) {
        const nc = col + DX[k]
        const nr = row + DY[k]
        if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
        if (!valid(nr * width + nc)) seed = true
      }
      if (seed) {
        filled[i] = data[i]
        closed[i] = 1
        heap.push(data[i], i)
      } else {
        filled[i] = Infinity
      }
    }
  }

  while (heap.size > 0) {
    const c = heap.pop()
    const col = c % width
    const row = (c / width) | 0
    const cf = filled[c]
    for (let k = 0; k < 8; k++) {
      const nc = col + DX[k]
      const nr = row + DY[k]
      if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
      const ni = nr * width + nc
      if (closed[ni] || !valid(ni)) continue
      const lift = cf + EPS
      filled[ni] = data[ni] > lift ? data[ni] : lift
      closed[ni] = 1
      heap.push(filled[ni], ni)
    }
  }
  return filled
}

/**
 * D8 steepest-descent flow direction (index 0–7, or -1 for sink/no-data).
 * Pass `elev` (the depression-filled grid) so routing is computed over a
 * hydrologically-corrected surface; defaults to the raw DEM.
 */
export function computeFlowDirection(dem: DemGrid, elev: Float32Array = dem.data): Int8Array {
  const { width, height, cellSizeM } = dem
  const data = elev
  const dir = new Int8Array(width * height).fill(-1)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col
      const z = data[i]
      if (!Number.isFinite(z)) continue
      let best = -1
      let bestSlope = 0
      for (let k = 0; k < 8; k++) {
        const nc = col + DX[k]
        const nr = row + DY[k]
        if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
        const zn = data[nr * width + nc]
        if (!Number.isFinite(zn)) continue
        const slope = (z - zn) / (DDIST[k] * cellSizeM)
        if (slope > bestSlope) {
          bestSlope = slope
          best = k
        }
      }
      dir[i] = best
    }
  }
  return dir
}

/**
 * Flow accumulation by processing cells from highest to lowest elevation.
 * Uses `elev` (the depression-filled grid) for the processing order so flow is
 * propagated strictly upstream→downstream; defaults to the raw DEM.
 */
export function computeFlowAccumulation(
  dem: DemGrid,
  dir: Int8Array,
  elev: Float32Array = dem.data,
): Float32Array {
  const { width, height } = dem
  const data = elev
  const n = width * height
  const accum = new Float32Array(n).fill(1)
  const order: number[] = []
  for (let i = 0; i < n; i++) if (Number.isFinite(data[i])) order.push(i)
  order.sort((a, b) => data[b] - data[a])
  for (const i of order) {
    const k = dir[i]
    if (k < 0) continue
    const col = i % width
    const row = (i / width) | 0
    const nc = col + DX[k]
    const nr = row + DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
    accum[nr * width + nc] += accum[i]
  }
  return accum
}

/* ── vector extraction ────────────────────────────────────────────────────── */

/**
 * Extract a fully-segmented drainage network (one LineString per cell→downstream
 * link, never merged) and classify every segment two ways so the map can recolor
 * without recomputing:
 *   • `strahler` — true Strahler stream order. Headwaters = 1; the order only
 *     increments where two channels of the SAME highest order meet (a confluence),
 *     otherwise the max upstream order passes through. Computed by walking stream
 *     cells from lowest→highest flow accumulation (i.e. upstream before downstream)
 *     and propagating each cell's order to its downstream neighbour.
 *   • `shelter` — terrain-exposure / flow-concentration class (0 sheltered → 2
 *     highly exposed) from log-normalised flow accumulation: faint headwaters are
 *     "protected", high-accumulation main channels are "high exposure" zones.
 */
function buildStreams(
  dem: DemGrid,
  dir: Int8Array,
  accum: Float32Array,
  inAoi: Uint8Array,
  threshold: number,
): {
  fc: GeoJSON.FeatureCollection
  cells: number
  lengthKm: number
  maxOrder: number
  maxShreve: number
} {
  const { width, height, lngs, lats } = dem
  const n = width * height

  // 1. Stream mask + downstream-stream link + peak accumulation.
  const isStream = new Uint8Array(n)
  let maxAccum = threshold
  for (let i = 0; i < n; i++) {
    if (accum[i] >= threshold && inAoi[i]) {
      isStream[i] = 1
      if (accum[i] > maxAccum) maxAccum = accum[i]
    }
  }
  const down = new Int32Array(n).fill(-1)
  const streamCells: number[] = []
  for (let i = 0; i < n; i++) {
    if (!isStream[i]) continue
    streamCells.push(i)
    const k = dir[i]
    if (k < 0) continue
    const nc = (i % width) + DX[k]
    const nr = ((i / width) | 0) + DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) continue
    const ni = nr * width + nc
    if (isStream[ni]) down[i] = ni
  }

  // 2. Strahler order + Shreve magnitude — process upstream→downstream (ascending accumulation).
  //    Strahler: increments only where two channels of the same highest order meet.
  //    Shreve: additive link magnitude — headwaters = 1, every confluence sums all
  //    upstream magnitudes, so the trunk magnitude equals the count of source links.
  streamCells.sort((a, b) => accum[a] - accum[b])
  const ord = new Int32Array(n)
  const upMax = new Int32Array(n) // greatest upstream order arriving at the cell
  const upMaxCnt = new Int32Array(n) // how many upstream links carry that order
  const mag = new Int32Array(n) // Shreve magnitude of the link leaving the cell
  const upMagSum = new Int32Array(n) // summed magnitude of all upstream links
  let maxShreve = 1
  for (const i of streamCells) {
    const o = upMax[i] === 0 ? 1 : upMaxCnt[i] >= 2 ? upMax[i] + 1 : upMax[i]
    ord[i] = o
    const m = upMagSum[i] === 0 ? 1 : upMagSum[i]
    mag[i] = m
    if (m > maxShreve) maxShreve = m
    const d = down[i]
    if (d >= 0) {
      if (o > upMax[d]) {
        upMax[d] = o
        upMaxCnt[d] = 1
      } else if (o === upMax[d]) {
        upMaxCnt[d]++
      }
      upMagSum[d] += m
    }
  }

  // 3. Emit one segment per downstream link, tagged with both classifications.
  const lnThr = Math.log(Math.max(1, threshold))
  const lnMax = Math.log(Math.max(threshold * 1.0001, maxAccum))
  const span = Math.max(1e-6, lnMax - lnThr)
  const segments: GeoJSON.Feature[] = []
  let lengthKm = 0
  let maxOrder = 1
  for (const i of streamCells) {
    const d = down[i]
    if (d < 0) continue
    const a: GeoJSON.Position = [lngs[i % width], lats[(i / width) | 0]]
    const b: GeoJSON.Position = [lngs[d % width], lats[(d / width) | 0]]
    const dLng = (b[0] - a[0]) * metersPerDegreeLng(a[1])
    const dLat = (b[1] - a[1]) * METERS_PER_DEGREE_LAT
    lengthKm += Math.sqrt(dLng * dLng + dLat * dLat) / 1000
    const t = (Math.log(Math.max(1, accum[i])) - lnThr) / span
    const shelter = t < 0.34 ? 0 : t < 0.67 ? 1 : 2
    if (ord[i] > maxOrder) maxOrder = ord[i]
    segments.push({
      type: 'Feature',
      properties: { strahler: ord[i], shreve: mag[i], shelter },
      geometry: { type: 'LineString', coordinates: [a, b] },
    })
  }
  return {
    fc: { type: 'FeatureCollection', features: segments },
    cells: streamCells.length,
    lengthKm,
    maxOrder,
    maxShreve,
  }
}

function delineateWatershed(
  dem: DemGrid,
  dir: Int8Array,
  accum: Float32Array,
  inAoi: Uint8Array,
): { fc: GeoJSON.FeatureCollection; cells: number; outlet: [number, number] | null } {
  const { width, height, lngs, lats } = dem
  const n = width * height

  // Outlet = the in-AOI cell with the greatest flow accumulation.
  let outlet = -1
  let maxA = -1
  for (let i = 0; i < n; i++) {
    if (inAoi[i] && accum[i] > maxA) {
      maxA = accum[i]
      outlet = i
    }
  }
  const inBasin = new Uint8Array(n) // 0 unknown, 1 yes, 2 no
  if (outlet < 0) return { fc: { type: 'FeatureCollection', features: [] }, cells: 0, outlet: null }
  const outletLngLat: [number, number] = [lngs[outlet % width], lats[(outlet / width) | 0]]

  const downstream = (i: number): number => {
    const k = dir[i]
    if (k < 0) return -1
    const col = i % width
    const row = (i / width) | 0
    const nc = col + DX[k]
    const nr = row + DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) return -1
    return nr * width + nc
  }

  for (let s = 0; s < n; s++) {
    if (!Number.isFinite(dem.data[s])) continue
    const path: number[] = []
    let cur = s
    let verdict = 2
    while (cur >= 0) {
      if (cur === outlet) {
        verdict = 1
        break
      }
      if (inBasin[cur]) {
        verdict = inBasin[cur]
        break
      }
      path.push(cur)
      if (path.length > n) break
      cur = downstream(cur)
    }
    for (const p of path) inBasin[p] = verdict as 1 | 2
    if (inBasin[outlet] === 0) inBasin[outlet] = 1
  }

  let cells = 0
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (inBasin[i] === 1 && inAoi[i]) {
      mask[i] = 1
      cells++
    }
  }

  const rings = maskToRings(dem, mask)
  const features: GeoJSON.Feature[] = rings.map(ring => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  }))
  return { fc: { type: 'FeatureCollection', features }, cells, outlet: outletLngLat }
}

/** Trace the rectilinear outline(s) of a boolean cell mask into geo rings. */
export function maskToRings(dem: DemGrid, mask: Uint8Array): GeoJSON.Position[][] {
  const { width, height, lngs, lats } = dem
  const cornerLng = new Float64Array(width + 1)
  const cornerLat = new Float64Array(height + 1)
  cornerLng[0] = lngs[0] - (width > 1 ? (lngs[1] - lngs[0]) / 2 : 0)
  for (let c = 1; c < width; c++) cornerLng[c] = (lngs[c - 1] + lngs[c]) / 2
  cornerLng[width] = lngs[width - 1] + (width > 1 ? (lngs[width - 1] - lngs[width - 2]) / 2 : 0)
  cornerLat[0] = lats[0] + (height > 1 ? (lats[0] - lats[1]) / 2 : 0)
  for (let r = 1; r < height; r++) cornerLat[r] = (lats[r - 1] + lats[r]) / 2
  cornerLat[height] = lats[height - 1] - (height > 1 ? (lats[height - 2] - lats[height - 1]) / 2 : 0)

  const inside = (c: number, r: number): boolean =>
    c >= 0 && r >= 0 && c < width && r < height && mask[r * width + c] === 1

  // Collect exposed unit edges as corner-index pairs.
  type Edge = [number, number, number, number] // ci0, ri0, ci1, ri1
  const edges: Edge[] = []
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!inside(c, r)) continue
      if (!inside(c, r - 1)) edges.push([c, r, c + 1, r]) // top
      if (!inside(c, r + 1)) edges.push([c, r + 1, c + 1, r + 1]) // bottom
      if (!inside(c - 1, r)) edges.push([c, r, c, r + 1]) // left
      if (!inside(c + 1, r)) edges.push([c + 1, r, c + 1, r + 1]) // right
    }
  }
  if (!edges.length) return []

  const key = (ci: number, ri: number): string => `${ci},${ri}`
  const adj = new Map<string, Array<{ to: string; ci: number; ri: number; used: boolean }>>()
  const addAdj = (aci: number, ari: number, bci: number, bri: number) => {
    const ak = key(aci, ari)
    if (!adj.has(ak)) adj.set(ak, [])
    adj.get(ak)!.push({ to: key(bci, bri), ci: bci, ri: bri, used: false })
  }
  for (const [aci, ari, bci, bri] of edges) {
    addAdj(aci, ari, bci, bri)
    addAdj(bci, bri, aci, ari)
  }

  const toCoord = (ci: number, ri: number): GeoJSON.Position => [cornerLng[ci], cornerLat[ri]]
  const rings: GeoJSON.Position[][] = []
  const startKeys = Array.from(adj.keys())

  for (const startKey of startKeys) {
    const list = adj.get(startKey)
    if (!list || list.every(e => e.used)) continue
    const ring: GeoJSON.Position[] = []
    let curKey = startKey
    let [cc, cr] = curKey.split(',').map(Number)
    let guard = 0
    while (guard++ < edges.length * 2 + 4) {
      ring.push(toCoord(cc, cr))
      const neighbors = adj.get(curKey)
      if (!neighbors) break
      const next = neighbors.find(e => !e.used)
      if (!next) break
      next.used = true
      const back = adj.get(next.to)?.find(e => e.to === curKey && !e.used)
      if (back) back.used = true
      curKey = next.to
      cc = next.ci
      cr = next.ri
      if (curKey === startKey) {
        ring.push(toCoord(cc, cr))
        break
      }
    }
    if (ring.length >= 4) rings.push(ring)
  }

  rings.sort((a, b) => b.length - a.length)
  return rings
}

/* ── raster rendering ─────────────────────────────────────────────────────── */

function slopeDegrees(dem: DemGrid, col: number, row: number): number {
  const { data, width, height, cellSizeM } = dem
  const z = (c: number, r: number): number => {
    const cc = Math.max(0, Math.min(width - 1, c))
    const rr = Math.max(0, Math.min(height - 1, r))
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

function hillshade(dem: DemGrid, col: number, row: number): number {
  const { data, width, height, cellSizeM } = dem
  const z = (c: number, r: number): number => {
    const cc = Math.max(0, Math.min(width - 1, c))
    const rr = Math.max(0, Math.min(height - 1, r))
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
  const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy))
  let aspect = Math.atan2(dzdy, -dzdx)
  if (aspect < 0) aspect += 2 * Math.PI
  const zenith = (45 * Math.PI) / 180
  const azimuth = (315 * Math.PI) / 180
  const sh =
    Math.cos(zenith) * Math.cos(slope) +
    Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect)
  return Math.max(0, Math.min(1, sh))
}

function renderDemRaster(dem: DemGrid, inAoi: Uint8Array, min: number, max: number): string {
  const { width, height, data } = dem
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const span = Math.max(1e-6, max - min)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    if (!inAoi[i] || !Number.isFinite(data[i])) {
      img.data[o + 3] = 0
      continue
    }
    const t = (data[i] - min) / span
    const [r, g, b] = rampColor(HYPSOMETRIC, t)
    const sh = 0.45 + 0.55 * hillshade(dem, i % width, (i / width) | 0)
    img.data[o] = Math.round(r * sh)
    img.data[o + 1] = Math.round(g * sh)
    img.data[o + 2] = Math.round(b * sh)
    img.data[o + 3] = 235
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** D8 direction palette (E, SE, S, SW, W, NW, N, NE) — distinct hues per flow vector. */
const FLOW_DIR_COLORS: Array<[number, number, number]> = [
  [255, 99, 99],
  [255, 170, 80],
  [255, 235, 90],
  [140, 230, 110],
  [90, 210, 255],
  [120, 150, 255],
  [180, 120, 255],
  [255, 120, 200],
]

function renderFlowDirRaster(dem: DemGrid, inAoi: Uint8Array, dir: Int8Array): string {
  const { width, height } = dem
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    const d = dir[i]
    if (!inAoi[i] || d < 0) {
      img.data[o + 3] = 0
      continue
    }
    const [r, g, b] = FLOW_DIR_COLORS[d & 7]
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function renderFlowRaster(
  dem: DemGrid,
  inAoi: Uint8Array,
  accum: Float32Array,
  maxAccum: number,
): string {
  const { width, height } = dem
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(width, height)
  const denom = Math.log(1 + maxAccum) || 1
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    if (!inAoi[i]) {
      img.data[o + 3] = 0
      continue
    }
    const t = Math.log(1 + accum[i]) / denom
    const [r, g, b] = rampColor(FLOW_RAMP, t)
    img.data[o] = Math.round(r)
    img.data[o + 1] = Math.round(g)
    img.data[o + 2] = Math.round(b)
    // Hide the diffuse background but render channels boldly (no faint washout).
    img.data[o + 3] = t < 0.18 ? 0 : Math.round(255 * Math.min(1, 0.5 + t))
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/* ── per-stage engine (independent runs share one context) ──────────────────── */

/**
 * Mutable analysis context shared across independently-runnable stages. Each
 * stage lazily ensures its prerequisites (DEM → flow → streams/watershed/mesh)
 * by reusing whatever the context already holds, so a user can run just "DEM",
 * then later just "Streams" without recomputing the DEM.
 */
export type HydroContext = {
  aoi: Poly
  bounds: HydroBounds
  coordinates: HydroCoordinates
  dem: DemGrid | null
  inAoi: Uint8Array | null
  elev: { min: number; max: number; mean: number; count: number } | null
  /** Depression-filled elevation grid used for flow routing. */
  filled: Float32Array | null
  dir: Int8Array | null
  accum: Float32Array | null
  maxAccum: number
}

function boundsOf(poly: Poly): HydroBounds {
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

export function createHydroContext(aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon): HydroContext {
  const bounds = boundsOf(aoi)
  const [minLng, minLat, maxLng, maxLat] = bounds
  return {
    aoi,
    bounds,
    coordinates: [
      [minLng, maxLat],
      [maxLng, maxLat],
      [maxLng, minLat],
      [minLng, minLat],
    ],
    dem: null,
    inAoi: null,
    elev: null,
    filled: null,
    dir: null,
    accum: null,
    maxAccum: 1,
  }
}

/** Stage 1+2: ensure a DEM grid (+ AOI mask + elevation summary) exists. */
export async function hydroEnsureDem(
  ctx: HydroContext,
  opts?: { signal?: AbortSignal; onProgress?: (f: number) => void },
): Promise<{ demImageUrl: string }> {
  if (!ctx.dem || !ctx.inAoi || !ctx.elev) {
    const dem = await buildDemForBounds(ctx.bounds, {
      signal: opts?.signal,
      onProgress: opts?.onProgress,
    })
    const inAoi = computeInAoiMask(dem, ctx.aoi)
    let min = Infinity
    let max = -Infinity
    let sum = 0
    let count = 0
    for (let i = 0; i < dem.data.length; i++) {
      if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
      const v = dem.data[i]
      min = Math.min(min, v)
      max = Math.max(max, v)
      sum += v
      count++
    }
    if (!count) {
      min = 0
      max = 0
    }
    ctx.dem = dem
    ctx.inAoi = inAoi
    ctx.elev = { min, max, mean: count ? sum / count : 0, count }
  }
  return { demImageUrl: renderDemRaster(ctx.dem, ctx.inAoi, ctx.elev.min, ctx.elev.max) }
}

/** Stage: slope (degrees) raster — green flat → red steep. */
export function hydroComputeSlope(ctx: HydroContext): {
  slopeImageUrl: string
  meanSlopeDeg: number
  maxSlopeDeg: number
} {
  if (!ctx.dem || !ctx.inAoi) throw new Error('Run DEM before slope.')
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const slopeGrid = new Float32Array(dem.width * dem.height)
  let sum = 0
  let count = 0
  let maxSlope = 0
  for (let row = 0; row < dem.height; row++) {
    for (let col = 0; col < dem.width; col++) {
      const i = row * dem.width + col
      if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
      const s = slopeDegrees(dem, col, row)
      slopeGrid[i] = s
      sum += s
      count++
      if (s > maxSlope) maxSlope = s
    }
  }
  // Normalise to a perceptual ceiling (45°) so steep terrain stays vivid.
  const cap = Math.max(12, Math.min(45, maxSlope))
  const slopeImageUrl = renderCellRaster(dem, i => {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) return null
    const [r, g, b] = rampColor(SLOPE_RAMP, slopeGrid[i] / cap)
    return [Math.round(r), Math.round(g), Math.round(b), 225]
  })
  return {
    slopeImageUrl,
    meanSlopeDeg: count ? Number((sum / count).toFixed(1)) : 0,
    maxSlopeDeg: Number(maxSlope.toFixed(1)),
  }
}

/** Ensure the depression-filled grid + D8 flow direction exist (lazily, once). */
function ensureFlowRouting(ctx: HydroContext): void {
  if (!ctx.dem) throw new Error('Run DEM before flow routing.')
  if (!ctx.filled) ctx.filled = fillDepressions(ctx.dem)
  if (!ctx.dir) ctx.dir = computeFlowDirection(ctx.dem, ctx.filled)
}

/** Stage: D8 flow direction raster (8-hue). */
export function hydroEnsureFlowDir(ctx: HydroContext): { flowDirImageUrl: string } {
  if (!ctx.dem || !ctx.inAoi) throw new Error('Run DEM before flow direction.')
  ensureFlowRouting(ctx)
  return { flowDirImageUrl: renderFlowDirRaster(ctx.dem, ctx.inAoi, ctx.dir!) }
}

/** Stage: D8 flow accumulation raster (log-scaled). */
export function hydroEnsureFlowAccum(ctx: HydroContext): { flowAccumImageUrl: string } {
  if (!ctx.dem || !ctx.inAoi) throw new Error('Run DEM before flow accumulation.')
  ensureFlowRouting(ctx)
  if (!ctx.accum) {
    const accum = computeFlowAccumulation(ctx.dem, ctx.dir!, ctx.filled!)
    let maxAccum = 1
    for (let i = 0; i < accum.length; i++) {
      if (ctx.inAoi[i] && accum[i] > maxAccum) maxAccum = accum[i]
    }
    ctx.accum = accum
    ctx.maxAccum = maxAccum
  }
  return { flowAccumImageUrl: renderFlowRaster(ctx.dem, ctx.inAoi, ctx.accum, ctx.maxAccum) }
}

/**
 * Stream-initiation threshold (in contributing cells) for drainage extraction.
 * Uses a contributing-area target but caps it relative to the peak accumulation
 * so that a connected, classified network is always produced — even on gentle
 * terrain where the absolute area target would never be met.
 */
const streamThresholdFor = (dem: DemGrid, maxAccum: number): number => {
  const areaTarget = Math.round(dem.width * dem.height * 0.004)
  const peak = maxAccum > 1 ? maxAccum : dem.width * dem.height
  const peakCap = Math.round(peak * 0.02)
  return Math.max(8, Math.min(areaTarget, peakCap))
}

/** Stage: Topographic Wetness Index raster — dry → wet. TWI = ln(a / tan β). */
export function hydroComputeWetness(ctx: HydroContext): {
  wetnessImageUrl: string
  meanWetness: number
} {
  if (!ctx.dem || !ctx.inAoi || !ctx.accum) throw new Error('Run flow accumulation before wetness.')
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const accum = ctx.accum
  const twi = new Float32Array(dem.width * dem.height)
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let count = 0
  for (let row = 0; row < dem.height; row++) {
    for (let col = 0; col < dem.width; col++) {
      const i = row * dem.width + col
      if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
      const a = (accum[i] * dem.cellSizeM) // specific catchment area per unit width
      const slopeRad = Math.max(0.001, (slopeDegrees(dem, col, row) * Math.PI) / 180)
      const v = Math.log(a / Math.tan(slopeRad))
      twi[i] = v
      if (v < min) min = v
      if (v > max) max = v
      sum += v
      count++
    }
  }
  const span = Math.max(1e-6, max - min)
  const wetnessImageUrl = renderCellRaster(dem, i => {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) return null
    const [r, g, b] = rampColor(WETNESS_RAMP, (twi[i] - min) / span)
    return [Math.round(r), Math.round(g), Math.round(b), 215]
  })
  return { wetnessImageUrl, meanWetness: count ? Number((sum / count).toFixed(2)) : 0 }
}

/**
 * Stage: flood susceptibility from HAND (Height Above Nearest Drainage). Each
 * cell drains downstream to the first channel cell; the elevation difference is
 * its HAND — low HAND ≈ flood-prone valley floor. Three classes (low/med/high).
 */
export function hydroComputeFlood(ctx: HydroContext): {
  floodImageUrl: string
  floodAreaHa: number
  floodPctOfAoi: number
} {
  if (!ctx.dem || !ctx.inAoi || !ctx.dir || !ctx.accum) {
    throw new Error('Run flow accumulation before flood.')
  }
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const dir = ctx.dir
  const accum = ctx.accum
  const { width, height, data, cellSizeM } = dem
  const n = width * height
  const threshold = streamThresholdFor(dem, ctx.maxAccum)
  const isStream = (i: number): boolean => accum[i] >= threshold
  const hand = new Float32Array(n).fill(-1)
  const downIdx = (i: number): number => {
    const k = dir[i]
    if (k < 0) return -1
    const nc = (i % width) + DX[k]
    const nr = ((i / width) | 0) + DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) return -1
    return nr * width + nc
  }
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
        // already resolved — recover its drainage elevation
        drainElev = data[cur] - hand[cur]
        break
      }
      path.push(cur)
      cur = downIdx(cur)
    }
    if (drainElev < 0) drainElev = path.length ? data[path[path.length - 1]] : data[s]
    for (const p of path) hand[p] = Math.max(0, data[p] - drainElev)
  }
  // Class thresholds in metres of height above drainage.
  const T_HIGH = 2
  const T_MED = 6
  const T_LOW = 12
  let floodCells = 0
  const floodImageUrl = renderCellRaster(dem, i => {
    if (!inAoi[i] || !Number.isFinite(data[i])) return null
    const h = hand[i]
    if (h < 0 || h > T_LOW) return null
    floodCells++
    if (h <= T_HIGH) return [120, 240, 255, 235]
    if (h <= T_MED) return [40, 150, 235, 215]
    return [12, 60, 150, 190]
  })
  const cellAreaHa = (cellSizeM * cellSizeM) / 10000
  const floodAreaHa = Number((floodCells * cellAreaHa).toFixed(1))
  const aoiAreaHa = polygonAreaHa(ctx.aoi)
  return {
    floodImageUrl,
    floodAreaHa,
    floodPctOfAoi: aoiAreaHa ? Number(((floodAreaHa / aoiAreaHa) * 100).toFixed(1)) : 0,
  }
}

/**
 * Stage: drainage basins as a clear, COMPLETE raster classified into the 5 MAIN
 * basins. Every cell is traced down-flow to its terminal sink / grid-exit; cells
 * sharing a terminal form a basin. The 5 largest basins by area become the main
 * classes (each a distinct vivid hue); every remaining cell (small basins) is
 * folded into the nearest main basin via a multi-source flood fill, so the whole
 * AOI is covered by exactly 5 crisp classes with no gaps.
 */
export function hydroComputeBasins(ctx: HydroContext): {
  basinImageUrl: string
  basinCount: number
} {
  if (!ctx.dem || !ctx.inAoi || !ctx.dir) throw new Error('Run flow direction before basins.')
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const dir = ctx.dir
  const { width, height, data } = dem
  const n = width * height
  const terminal = new Int32Array(n).fill(-2) // -2 unresolved, else terminal index
  const downIdx = (i: number): number => {
    const k = dir[i]
    if (k < 0) return -1
    const nc = (i % width) + DX[k]
    const nr = ((i / width) | 0) + DY[k]
    if (nc < 0 || nr < 0 || nc >= width || nr >= height) return -1
    return nr * width + nc
  }
  const resolve = (start: number): number => {
    const path: number[] = []
    let cur = start
    let term = -1
    for (let guard = 0; guard <= n; guard++) {
      if (cur < 0) {
        term = path.length ? path[path.length - 1] : start
        break
      }
      if (terminal[cur] !== -2) {
        term = terminal[cur]
        break
      }
      const d = downIdx(cur)
      if (d < 0) {
        term = cur
        break
      }
      path.push(cur)
      cur = d
    }
    for (const p of path) terminal[p] = term
    return term
  }
  // Resolve every in-AOI cell to its terminal and tally basin sizes.
  const sizeByTerm = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    if (!inAoi[i] || !Number.isFinite(data[i])) continue
    const term = terminal[i] === -2 ? resolve(i) : terminal[i]
    sizeByTerm.set(term, (sizeByTerm.get(term) ?? 0) + 1)
  }

  // The 5 largest basins become the main classes (0..4).
  const MAIN = 5
  const mainTerms = [...sizeByTerm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAIN)
    .map(([term]) => term)
  const classOf = new Map<number, number>()
  mainTerms.forEach((term, idx) => classOf.set(term, idx))

  // Seed each cell with its main class (or -1 for cells in smaller basins).
  const cls = new Int16Array(n).fill(-1)
  const queue: number[] = []
  for (let i = 0; i < n; i++) {
    if (!inAoi[i] || !Number.isFinite(data[i])) continue
    const c = classOf.get(terminal[i])
    if (c != null) {
      cls[i] = c
      queue.push(i)
    }
  }

  // Multi-source BFS: fold small-basin cells into the nearest main basin so the
  // AOI is fully covered by exactly 5 contiguous classes (no gaps).
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const col = i % width
    const row = (i / width) | 0
    const c = cls[i]
    if (col > 0) {
      const j = i - 1
      if (inAoi[j] && Number.isFinite(data[j]) && cls[j] === -1) (cls[j] = c), queue.push(j)
    }
    if (col < width - 1) {
      const j = i + 1
      if (inAoi[j] && Number.isFinite(data[j]) && cls[j] === -1) (cls[j] = c), queue.push(j)
    }
    if (row > 0) {
      const j = i - width
      if (inAoi[j] && Number.isFinite(data[j]) && cls[j] === -1) (cls[j] = c), queue.push(j)
    }
    if (row < height - 1) {
      const j = i + width
      if (inAoi[j] && Number.isFinite(data[j]) && cls[j] === -1) (cls[j] = c), queue.push(j)
    }
  }

  const basinImageUrl = renderCellRaster(dem, i => {
    if (!inAoi[i] || !Number.isFinite(data[i])) return null
    const c = cls[i]
    if (c < 0) return null
    const [r, g, b] = BASIN_PALETTE[c % BASIN_PALETTE.length]
    return [r, g, b, 235]
  })

  return { basinImageUrl, basinCount: Math.min(MAIN, sizeByTerm.size) }
}

/** Stage 4: streams / drainage network (Strahler-classified). */
export function hydroComputeStreams(ctx: HydroContext): {
  streams: GeoJSON.FeatureCollection
  streamLengthKm: number
  streamCells: number
  streamSegments: number
  maxStreamOrder: number
  maxShreveMagnitude: number
} {
  if (!ctx.dem || !ctx.inAoi || !ctx.dir || !ctx.accum) {
    throw new Error('Run flow accumulation before streams.')
  }
  const threshold = streamThresholdFor(ctx.dem, ctx.maxAccum)
  const out = buildStreams(ctx.dem, ctx.dir, ctx.accum, ctx.inAoi, threshold)
  return {
    streams: out.fc,
    streamLengthKm: Number(out.lengthKm.toFixed(2)),
    streamCells: out.cells,
    streamSegments: out.fc.features.length,
    maxStreamOrder: out.maxOrder,
    maxShreveMagnitude: out.maxShreve,
  }
}

/** Stage 5: watershed delineation. */
export function hydroComputeWatershed(ctx: HydroContext): {
  watershed: GeoJSON.FeatureCollection
  watershedAreaHa: number
  watershedAreaKm2: number
  watershedPctOfAoi: number
  watershedOutlet: [number, number] | null
} {
  if (!ctx.dem || !ctx.inAoi || !ctx.dir || !ctx.accum) {
    throw new Error('Run flow accumulation before watershed.')
  }
  const out = delineateWatershed(ctx.dem, ctx.dir, ctx.accum, ctx.inAoi)
  const cellAreaHa = (ctx.dem.cellSizeM * ctx.dem.cellSizeM) / 10000
  const watershedAreaHa = out.cells * cellAreaHa
  const aoiAreaHa = polygonAreaHa(ctx.aoi)
  return {
    watershed: out.fc,
    watershedAreaHa: Number(watershedAreaHa.toFixed(1)),
    watershedAreaKm2: Number((watershedAreaHa / 100).toFixed(2)),
    watershedPctOfAoi: aoiAreaHa ? Number(((watershedAreaHa / aoiAreaHa) * 100).toFixed(1)) : 0,
    watershedOutlet: out.outlet,
  }
}

/* ── hillshade (standalone) ───────────────────────────────────────────────── */

export const HYDRO_SUN_AZIMUTH_DEG = 315
export const HYDRO_SUN_ALTITUDE_DEG = 45

/** Stage: grayscale hillshade raster (sun azimuth 315°, altitude 45°). */
export function hydroComputeHillshade(ctx: HydroContext): {
  hillshadeImageUrl: string
  sunAzimuthDeg: number
  sunAltitudeDeg: number
} {
  if (!ctx.dem || !ctx.inAoi) throw new Error('Run DEM before hillshade.')
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const hillshadeImageUrl = renderCellRaster(dem, i => {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) return null
    const sh = hillshade(dem, i % dem.width, (i / dem.width) | 0)
    const v = Math.round(40 + 210 * sh)
    return [v, v, v, 235]
  })
  return {
    hillshadeImageUrl,
    sunAzimuthDeg: HYDRO_SUN_AZIMUTH_DEG,
    sunAltitudeDeg: HYDRO_SUN_ALTITUDE_DEG,
  }
}

/** Base statistics available once the DEM exists (elevation, slope, bands). */
export function hydroBaseStats(ctx: HydroContext): HydroStats {
  if (!ctx.dem || !ctx.inAoi || !ctx.elev) return {}
  const dem = ctx.dem
  const inAoi = ctx.inAoi
  const { min, max, mean, count } = ctx.elev
  const cellAreaHa = (dem.cellSizeM * dem.cellSizeM) / 10000

  let slopeSum = 0
  let slopeCount = 0
  for (let row = 0; row < dem.height; row++) {
    for (let col = 0; col < dem.width; col++) {
      const i = row * dem.width + col
      if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
      slopeSum += slopeDegrees(dem, col, row)
      slopeCount++
    }
  }
  const meanSlopeDeg = slopeCount ? slopeSum / slopeCount : 0

  const bandCount = 5
  const bandTally = new Array(bandCount).fill(0)
  const span = Math.max(1e-6, max - min)
  for (let i = 0; i < dem.data.length; i++) {
    if (!inAoi[i] || !Number.isFinite(dem.data[i])) continue
    let b = Math.floor(((dem.data[i] - min) / span) * bandCount)
    if (b >= bandCount) b = bandCount - 1
    if (b < 0) b = 0
    bandTally[b]++
  }
  const elevationBands: HydroElevationBand[] = bandTally.map((cnt, b) => {
    const lo = Math.round(min + (span * b) / bandCount)
    const hi = Math.round(min + (span * (b + 1)) / bandCount)
    const [r, g, bl] = rampColor(HYPSOMETRIC, (b + 0.5) / bandCount)
    return {
      name: `${lo}–${hi} m`,
      pct: count ? Number(((cnt / count) * 100).toFixed(1)) : 0,
      areaHa: cnt * cellAreaHa,
      color: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)})`,
    }
  })

  return {
    elevMin: Math.round(min),
    elevMax: Math.round(max),
    elevMean: Math.round(mean),
    reliefM: Math.round(max - min),
    meanSlopeDeg: Number(meanSlopeDeg.toFixed(1)),
    aoiAreaHa: Number(polygonAreaHa(ctx.aoi).toFixed(1)),
    cellSizeM: Math.round(dem.cellSizeM),
    gridWidth: dem.width,
    gridHeight: dem.height,
    elevationBands,
  }
}

/* ── orchestration (run-all) ──────────────────────────────────────────────── */

export async function runHydroAnalysis(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  opts?: { signal?: AbortSignal; onStage?: (stage: HydroStageKey, progress: number) => void },
): Promise<HydroResult> {
  const onStage = opts?.onStage ?? (() => {})
  const signal = opts?.signal
  const check = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  onStage('aoi', 1)
  const ctx = createHydroContext(aoi)
  check()

  const { demImageUrl } = await hydroEnsureDem(ctx, {
    signal,
    onProgress: f => onStage('dem', f),
  })
  check()

  onStage('slope', 0.5)
  const slopeOut = hydroComputeSlope(ctx)
  onStage('slope', 1)
  check()

  onStage('flowDir', 0.5)
  const { flowDirImageUrl } = hydroEnsureFlowDir(ctx)
  onStage('flowDir', 1)
  check()

  onStage('flowAccum', 0.5)
  const { flowAccumImageUrl } = hydroEnsureFlowAccum(ctx)
  onStage('flowAccum', 1)
  check()

  onStage('wetness', 0.5)
  const wetnessOut = hydroComputeWetness(ctx)
  onStage('wetness', 1)
  check()

  onStage('flood', 0.5)
  const floodOut = hydroComputeFlood(ctx)
  onStage('flood', 1)
  check()

  onStage('basin', 0.5)
  const basinOut = hydroComputeBasins(ctx)
  onStage('basin', 1)
  check()

  onStage('watershed', 0.4)
  const watershedOut = hydroComputeWatershed(ctx)
  onStage('watershed', 1)

  const stats: HydroStats = {
    ...hydroBaseStats(ctx),
    meanSlopeDeg: slopeOut.meanSlopeDeg,
    maxSlopeDeg: slopeOut.maxSlopeDeg,
    meanWetness: wetnessOut.meanWetness,
    floodAreaHa: floodOut.floodAreaHa,
    floodPctOfAoi: floodOut.floodPctOfAoi,
    basinCount: basinOut.basinCount,
    watershedAreaHa: watershedOut.watershedAreaHa,
    watershedPctOfAoi: watershedOut.watershedPctOfAoi,
  }

  return {
    bounds: ctx.bounds,
    coordinates: ctx.coordinates,
    demImageUrl,
    slopeImageUrl: slopeOut.slopeImageUrl,
    flowDirImageUrl,
    flowAccumImageUrl,
    wetnessImageUrl: wetnessOut.wetnessImageUrl,
    floodImageUrl: floodOut.floodImageUrl,
    basinImageUrl: basinOut.basinImageUrl,
    watershed: watershedOut.watershed,
    stats,
  }
}

/* ── Hydro Watershed tool (6-stage) orchestration ─────────────────────────── */

/** Map/panel layer identities for the Hydro Watershed tool (top-to-bottom render order). */
export type HydroWsLayerKey =
  | 'elevation'
  | 'hillshade'
  | 'slope'
  | 'flowAccum'
  | 'streams'
  | 'watershed'

export const HYDRO_WS_LAYER_KEYS: HydroWsLayerKey[] = [
  'elevation',
  'hillshade',
  'slope',
  'flowAccum',
  'streams',
  'watershed',
]

/** Focused result for the Hydro Watershed tool — exactly the six rendered stages. */
export type HydroWatershedResult = {
  bounds: HydroBounds
  coordinates: HydroCoordinates
  elevationImageUrl: string
  hillshadeImageUrl: string
  slopeImageUrl: string
  flowAccumImageUrl: string
  streams: GeoJSON.FeatureCollection
  watershed: GeoJSON.FeatureCollection
  /** Watershed pour point [lng, lat]. */
  outlet: [number, number] | null
  stats: HydroStats
}

/**
 * Terrain hydrology workflow used by the Hydro Watershed panel: AOI → DEM →
 * hillshade, slope, flow accumulation, drainage network (Strahler + Shreve) and
 * watershed delineation. Reuses one shared context so each stage builds on the
 * previous without recomputation.
 */
export async function runHydroWatershed(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  opts?: { signal?: AbortSignal; onStage?: (stage: HydroStageKey, progress: number) => void },
): Promise<HydroWatershedResult> {
  const onStage = opts?.onStage ?? (() => {})
  const signal = opts?.signal
  const check = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  onStage('aoi', 1)
  const ctx = createHydroContext(aoi)
  check()

  const { demImageUrl } = await hydroEnsureDem(ctx, {
    signal,
    onProgress: f => onStage('dem', f),
  })
  check()

  onStage('slope', 0.4)
  const hillshadeOut = hydroComputeHillshade(ctx)
  const slopeOut = hydroComputeSlope(ctx)
  onStage('slope', 1)
  check()

  onStage('flowAccum', 0.3)
  hydroEnsureFlowDir(ctx)
  const { flowAccumImageUrl } = hydroEnsureFlowAccum(ctx)
  onStage('flowAccum', 1)
  check()

  onStage('streams', 0.4)
  const streamsOut = hydroComputeStreams(ctx)
  onStage('streams', 1)
  check()

  onStage('watershed', 0.4)
  const watershedOut = hydroComputeWatershed(ctx)
  onStage('watershed', 1)

  const base = hydroBaseStats(ctx)
  const stats: HydroStats = {
    ...base,
    sunAzimuthDeg: hillshadeOut.sunAzimuthDeg,
    sunAltitudeDeg: hillshadeOut.sunAltitudeDeg,
    meanSlopeDeg: slopeOut.meanSlopeDeg,
    maxSlopeDeg: slopeOut.maxSlopeDeg,
    maxContributingCells: Math.round(ctx.maxAccum),
    streamSegments: streamsOut.streamSegments,
    streamLengthKm: streamsOut.streamLengthKm,
    maxStreamOrder: streamsOut.maxStreamOrder,
    maxShreveMagnitude: streamsOut.maxShreveMagnitude,
    watershedAreaHa: watershedOut.watershedAreaHa,
    watershedAreaKm2: watershedOut.watershedAreaKm2,
    watershedPctOfAoi: watershedOut.watershedPctOfAoi,
    watershedOutlet: watershedOut.watershedOutlet,
  }

  return {
    bounds: ctx.bounds,
    coordinates: ctx.coordinates,
    elevationImageUrl: demImageUrl,
    hillshadeImageUrl: hillshadeOut.hillshadeImageUrl,
    slopeImageUrl: slopeOut.slopeImageUrl,
    flowAccumImageUrl,
    streams: streamsOut.streams,
    watershed: watershedOut.watershed,
    outlet: watershedOut.watershedOutlet,
    stats,
  }
}
