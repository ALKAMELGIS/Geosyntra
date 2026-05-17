import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

const CHUNK_RELOAD_SESSION_KEY = 'geosyntra-chunk-reload-v1'

function isRecoverableChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return (
    msg.includes('before initialization') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  )
}

/**
 * `React.lazy` wrapper that retries once after a hard reload when a stale
 * GitHub Pages / service-worker cache serves a mismatched hashed chunk
 * (classic `Cannot access '…' before initialization` on Satellite Intelligence).
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (typeof window === 'undefined' || !isRecoverableChunkError(err)) throw err
      try {
        if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === '1') throw err
        sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1')
      } catch {
        throw err
      }
      window.location.reload()
      return new Promise<{ default: T }>(() => {})
    }),
  )
}
