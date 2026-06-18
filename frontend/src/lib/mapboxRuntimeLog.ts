/** Structured Mapbox / Map Canvas runtime logs (browser console). */
const PREFIX = '[mapbox-runtime]'

export function logMapboxTokenLoaded(meta: {
  configured: boolean
  hasPublicToken: boolean
  proxyMode?: boolean
  source?: string
}): void {
  console.info(`${PREFIX} token loaded`, meta)
}

export function logMapboxTokenLoadFailed(error: string): void {
  console.warn(`${PREFIX} token load failed`, { error })
}

export function logMapInitialized(meta: {
  basemapId: string
  styleType: 'vector' | 'raster' | 'empty'
  hasPlatformToken: boolean
}): void {
  console.info(`${PREFIX} map initialized`, meta)
}

export function logBasemapLoaded(meta: { basemapId: string; styleLoaded: boolean }): void {
  console.info(`${PREFIX} basemap loaded`, meta)
}

export function logMapTileError(meta: {
  message?: string
  url?: string
  status?: number
}): void {
  console.warn(`${PREFIX} tile error`, meta)
}

export function logMapResize(meta: { width: number; height: number }): void {
  console.debug(`${PREFIX} map resize`, meta)
}
