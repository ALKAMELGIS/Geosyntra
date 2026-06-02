/**
 * Guard against a benign-but-fatal Mapbox GL Web Worker error.
 *
 * Mapbox GL transfers worker task results to the main thread with a custom
 * class-registry serializer. When a tile request is aborted — which happens
 * routinely during fast zoom/pan — the worker raises a `DOMException`
 * (AbortError). That class is not in Mapbox's serializer registry, so it throws:
 *
 *   Uncaught Error: Can't serialize object of unregistered class "DOMException".
 *
 * The throw escapes as an uncaught window error and previously tore down the
 * entire SPA (showing the global error screen) and froze the half-painted
 * basemap mid-zoom. It is harmless: the aborted tile is simply re-fetched for
 * the new viewport. We swallow it as early as possible (capture phase) so it
 * never reaches the React error boundary or the browser console as a crash.
 */

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  const maybe = (err as { message?: unknown } | null | undefined)?.message
  return typeof maybe === 'string' ? maybe : ''
}

/** True when the error is the benign Mapbox worker DOMException serialization failure. */
export function isBenignMapboxSerializeError(err: unknown): boolean {
  const msg = messageOf(err)
  if (!msg) return false
  return (
    msg.includes("Can't serialize object of unregistered class") ||
    msg.includes('unregistered class "DOMException"') ||
    msg.includes('unregistered class DOMException')
  )
}

/**
 * True for transient Mapbox style-lifecycle errors that resolve on their own.
 *
 * "Style is not done loading" is thrown synchronously by Mapbox GL when a
 * source/layer/style mutation lands in the brief window while a basemap style
 * swap (`setStyle`) is still in flight. It is harmless — the style finishes
 * loading a frame later and the operation can be retried — but if it escapes
 * into a React commit it would otherwise tear down the whole map. We treat it
 * as recoverable so the map self-heals instead of showing the crash screen.
 */
export function isTransientMapboxStyleError(err: unknown): boolean {
  const msg = messageOf(err).toLowerCase()
  if (!msg) return false
  return (
    msg.includes('style is not done loading') ||
    msg.includes('style is not loaded') ||
    (msg.includes('cannot read properties of undefined') && msg.includes("reading 'get'")) ||
    msg.includes('there is no style added to the map')
  )
}

/** Errors the map can silently recover from (no global crash screen). */
export function isRecoverableMapboxMapError(err: unknown): boolean {
  return isBenignMapboxSerializeError(err) || isTransientMapboxStyleError(err)
}

let installed = false

/** Install capture-phase listeners once, before React mounts. Idempotent. */
export function installMapboxWorkerErrorGuard(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const candidate = event.error ?? event.message
      if (!isRecoverableMapboxMapError(candidate)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      try {
        console.warn('[mapbox] Suppressed recoverable map error:', messageOf(candidate))
      } catch {
        /* console may be unavailable */
      }
    },
    true,
  )

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      if (!isRecoverableMapboxMapError(event.reason)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      try {
        console.warn('[mapbox] Suppressed recoverable map rejection:', messageOf(event.reason))
      } catch {
        /* console may be unavailable */
      }
    },
    true,
  )
}
