/**
 * Global platform token revision — bumped when Owner rotates keys.
 * Clients compare revision to invalidate cached runtime config.
 */

let revision = Date.now()
/** @type {((payload: { revision: number; reason: string }) => void) | null} */
let broadcastFn = null

export function getTokenRevision() {
  return revision
}

export function registerTokenRevisionBroadcast(fn) {
  broadcastFn = typeof fn === 'function' ? fn : null
}

/**
 * @param {string} [reason]
 */
export function bumpTokenRevision(reason = 'token_updated') {
  revision = Date.now()
  if (broadcastFn) {
    try {
      broadcastFn({ revision, reason })
    } catch (e) {
      console.error('[token-revision] broadcast failed', e)
    }
  }
  return revision
}
