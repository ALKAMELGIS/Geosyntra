import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { CHUNK_RELOAD_SESSION_KEY, isRecoverableChunkError, tryReloadForStaleChunk } from './chunkReloadRecovery'

export { isRecoverableChunkError, tryReloadForStaleChunk }

/**
 * `React.lazy` wrapper that retries once after a hard reload when a stale
 * GitHub Pages / service-worker cache serves a mismatched hashed chunk.
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory()
      .then(mod => {
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY)
        } catch {
          /* ignore */
        }
        return mod
      })
      .catch((err: unknown) => {
        if (tryReloadForStaleChunk(err)) {
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }),
  )
}
