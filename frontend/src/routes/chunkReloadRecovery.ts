/** One automatic hard reload when a stale hashed Vite chunk fails to load (GitHub Pages / CDN cache). */
export const CHUNK_RELOAD_SESSION_KEY = 'geosyntra-chunk-reload-v1'

export function isRecoverableChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return (
    msg.includes('before initialization') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

/** Returns true when a full navigation reload was started. */
export function tryReloadForStaleChunk(err: unknown): boolean {
  if (typeof window === 'undefined' || !isRecoverableChunkError(err)) return false
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') return false
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1')
  } catch {
    return false
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_chunk', String(Date.now()))
  window.location.replace(url.toString())
  return true
}
