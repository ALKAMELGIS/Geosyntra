/**
 * Digital Elevation Model (DEM) acquisition for the Hydro Watershed workflow.
 *
 * Elevation is sampled from the public, token-free AWS "terrarium" terrain tile
 * set (Mapzen/AWS Open Data) — the same source the 3D terrain layer uses — so
 * the workflow has no extra credential or backend dependency. Tiles covering the
 * AOI bounding box are fetched, stitched onto a canvas, cropped to the AOI, and
 * decoded into a regular elevation grid with per-row/column geographic centres.
 */

import {
  TILE_SIZE,
  latToTileY,
  lngToTileX,
  metersPerDegreeLng,
  METERS_PER_DEGREE_LAT,
  tileXToLng,
  tileYToLat,
} from './webMercatorTiles'

const TERRARIUM_TEMPLATE =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/** Regular elevation grid (row-major) with geographic metadata. */
export type DemGrid = {
  /** Elevation in metres, length = width * height, row-major (top → bottom). */
  data: Float32Array
  width: number
  height: number
  /** Geographic centre longitude of each column (length = width). */
  lngs: Float64Array
  /** Geographic centre latitude of each row (length = height). */
  lats: Float64Array
  /** AOI bounding box the grid covers: [minLng, minLat, maxLng, maxLat]. */
  bounds: [number, number, number, number]
  /** Approximate cell size in metres (average of x/y spacing at centre). */
  cellSizeM: number
  /** No-data sentinel (NaN cells excluded from analysis). */
  noData: number
}

type Bounds = [number, number, number, number]

const MAX_TILES = 96
// Analysis/raster grid resolution cap. Higher → crisper, more detailed analysis
// rasters at full native resolution (no downsampling) at the cost of more
// compute. Accuracy/detail is prioritised over speed per product requirements.
const MAX_GRID_DIM = 512

function loadTileImageData(z: number, x: number, y: number): Promise<ImageData | null> {
  const max = Math.pow(2, z)
  const wrappedX = ((x % max) + max) % max
  const url = TERRARIUM_TEMPLATE.replace('{z}', String(z))
    .replace('{x}', String(wrappedX))
    .replace('{y}', String(y))
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = TILE_SIZE
        c.height = TILE_SIZE
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE)
        resolve(ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Terrarium RGB → elevation in metres. */
function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Pick a zoom so the AOI spans a workable number of pixels without too many tiles. */
function chooseZoom(bounds: Bounds): number {
  const [minLng, minLat, maxLng, maxLat] = bounds
  for (let z = 13; z >= 8; z--) {
    const x0 = Math.floor(lngToTileX(minLng, z))
    const x1 = Math.floor(lngToTileX(maxLng, z))
    const y0 = Math.floor(latToTileY(maxLat, z))
    const y1 = Math.floor(latToTileY(minLat, z))
    const tiles = (x1 - x0 + 1) * (y1 - y0 + 1)
    if (tiles <= MAX_TILES) return z
  }
  return 8
}

/**
 * Build a DEM grid for an AOI bounding box. Throws if no terrain tiles could be
 * fetched (offline / blocked), letting the caller surface a clean error.
 */
export async function buildDemForBounds(
  bounds: Bounds,
  opts?: { signal?: AbortSignal; onProgress?: (f: number) => void },
): Promise<DemGrid> {
  const [minLng, minLat, maxLng, maxLat] = bounds
  const z = chooseZoom(bounds)
  const x0 = Math.floor(lngToTileX(minLng, z))
  const x1 = Math.floor(lngToTileX(maxLng, z))
  const y0 = Math.floor(latToTileY(maxLat, z))
  const y1 = Math.floor(latToTileY(minLat, z))
  const tilesX = x1 - x0 + 1
  const tilesY = y1 - y0 + 1

  const stitchW = tilesX * TILE_SIZE
  const stitchH = tilesY * TILE_SIZE
  const elev = new Float32Array(stitchW * stitchH)

  const jobs: Array<{ tx: number; ty: number; ox: number; oy: number }> = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push({ tx, ty, ox: (tx - x0) * TILE_SIZE, oy: (ty - y0) * TILE_SIZE })
    }
  }

  const total = jobs.length
  let done = 0
  const CONCURRENCY = 8
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < jobs.length) {
      if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const job = jobs[cursor++]
      const tile = await loadTileImageData(z, job.tx, job.ty)
      const { ox, oy } = job
      if (tile) {
        const d = tile.data
        for (let py = 0; py < TILE_SIZE; py++) {
          for (let px = 0; px < TILE_SIZE; px++) {
            const si = (py * TILE_SIZE + px) * 4
            const e = decodeTerrarium(d[si], d[si + 1], d[si + 2])
            elev[(oy + py) * stitchW + (ox + px)] = e
          }
        }
      } else {
        for (let py = 0; py < TILE_SIZE; py++) {
          for (let px = 0; px < TILE_SIZE; px++) {
            elev[(oy + py) * stitchW + (ox + px)] = NaN
          }
        }
      }
      done++
      opts?.onProgress?.(done / total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))

  // Crop window (in stitched-pixel space) for the AOI bbox.
  const pxMin = (lngToTileX(minLng, z) - x0) * TILE_SIZE
  const pxMax = (lngToTileX(maxLng, z) - x0) * TILE_SIZE
  const pyTop = (latToTileY(maxLat, z) - y0) * TILE_SIZE
  const pyBot = (latToTileY(minLat, z) - y0) * TILE_SIZE
  const cropW = Math.max(2, Math.round(pxMax - pxMin))
  const cropH = Math.max(2, Math.round(pyBot - pyTop))

  const step = Math.max(1, Math.ceil(Math.max(cropW, cropH) / MAX_GRID_DIM))
  const width = Math.max(2, Math.floor(cropW / step))
  const height = Math.max(2, Math.floor(cropH / step))

  const data = new Float32Array(width * height)
  const lngs = new Float64Array(width)
  const lats = new Float64Array(height)
  let anyValid = false

  for (let col = 0; col < width; col++) {
    const sx = pxMin + col * step + step / 2
    lngs[col] = tileXToLng(x0 + sx / TILE_SIZE, z)
  }
  for (let row = 0; row < height; row++) {
    const sy = pyTop + row * step + step / 2
    lats[row] = tileYToLat(y0 + sy / TILE_SIZE, z)
  }

  for (let row = 0; row < height; row++) {
    const sy = Math.min(stitchH - 1, Math.round(pyTop + row * step + step / 2))
    for (let col = 0; col < width; col++) {
      const sx = Math.min(stitchW - 1, Math.round(pxMin + col * step + step / 2))
      const v = elev[sy * stitchW + sx]
      if (Number.isFinite(v) && v > -11000 && v < 9000) {
        data[row * width + col] = v
        anyValid = true
      } else {
        data[row * width + col] = NaN
      }
    }
  }

  if (!anyValid) {
    throw new Error('No elevation data could be retrieved for this AOI.')
  }

  const centerLat = (minLat + maxLat) / 2
  const dLng = width > 1 ? Math.abs(lngs[1] - lngs[0]) : (maxLng - minLng) / width
  const dLat = height > 1 ? Math.abs(lats[0] - lats[1]) : (maxLat - minLat) / height
  const cellW = dLng * metersPerDegreeLng(centerLat)
  const cellH = dLat * METERS_PER_DEGREE_LAT
  const cellSizeM = Math.max(1, (cellW + cellH) / 2)

  return { data, width, height, lngs, lats, bounds, cellSizeM, noData: NaN }
}
