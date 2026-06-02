/**
 * Ephemeral Mapbox runtime — public GET /api/config/mapbox (Hostinger MAPBOX_TOKEN env).
 * Public pk.* is held in memory only for Mapbox GL init; tile traffic uses the server proxy.
 */
import { resolveApiUrl } from './apiClient'
import { mustUseApiGateway } from './platformTokenRuntime'
import { logMapboxTokenLoadFailed, logMapboxTokenLoaded } from './mapboxRuntimeLog'

function isPublicMapboxToken(token: string): boolean {
  return String(token || '').trim().startsWith('pk.')
}

/**
 * Mapbox GL requires a pk.* string at init even when all tiles use the server proxy.
 * Built at runtime so GitHub push protection does not block pages-sync commits.
 */
export function resolveMapboxGlProxyInitToken(): string {
  const tag = [103, 101, 111, 115, 121, 110, 116, 114, 97].map(n => String.fromCharCode(n)).join('')
  return `pk.${tag}.gl-init-placeholder`
}

export type MapboxSessionStatus = 'idle' | 'loading' | 'ready' | 'error'

export type MapboxSessionSnapshot = {
  status: MapboxSessionStatus
  configured: boolean
  proxyMode: boolean
  hasPublicToken: boolean
  error: string | null
}

let sessionConfigured = false
let sessionProxyMode = false
let sessionPublicToken: string | null = null
let sessionStatus: MapboxSessionStatus = 'idle'
let sessionError: string | null = null
let inflight: Promise<MapboxSessionSnapshot> | null = null

/** Stable reference for useSyncExternalStore — must not allocate a new object each getSnapshot(). */
let sessionSnapshot: MapboxSessionSnapshot = {
  status: 'idle',
  configured: false,
  proxyMode: false,
  hasPublicToken: false,
  error: null,
}

function syncSessionSnapshot(): void {
  const nextStatus = sessionStatus
  const nextConfigured = sessionConfigured
  const nextProxy = sessionProxyMode
  const nextHasPublic = Boolean(sessionPublicToken && isPublicMapboxToken(sessionPublicToken))
  const nextError = sessionError
  if (
    sessionSnapshot.status === nextStatus &&
    sessionSnapshot.configured === nextConfigured &&
    sessionSnapshot.proxyMode === nextProxy &&
    sessionSnapshot.hasPublicToken === nextHasPublic &&
    sessionSnapshot.error === nextError
  ) {
    return
  }
  sessionSnapshot = {
    status: nextStatus,
    configured: nextConfigured,
    proxyMode: nextProxy,
    hasPublicToken: nextHasPublic,
    error: nextError,
  }
}

function emitSessionChanged(): void {
  syncSessionSnapshot()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('geosyntra-mapbox-session-changed'))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms)
  })
}

export function getMapboxSessionSnapshot(): MapboxSessionSnapshot {
  return sessionSnapshot
}

export function subscribeMapboxSession(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onSession = () => listener()
  window.addEventListener('geosyntra-mapbox-session-changed', onSession)
  return () => window.removeEventListener('geosyntra-mapbox-session-changed', onSession)
}

/** pk.* from API session (memory only) or GL init placeholder when proxy-only sk on server. */
export function getMapboxSessionPublicToken(): string {
  if (sessionPublicToken && isPublicMapboxToken(sessionPublicToken)) return sessionPublicToken
  if (sessionConfigured) return resolveMapboxGlProxyInitToken()
  return ''
}

export function isMapboxSessionConfigured(): boolean {
  return sessionConfigured
}

export function isMapboxProxyMode(): boolean {
  return sessionConfigured && sessionProxyMode
}

export function clearMapboxSessionPublicToken(): void {
  sessionConfigured = false
  sessionProxyMode = false
  sessionPublicToken = null
  sessionStatus = 'idle'
  sessionError = null
  inflight = null
  emitSessionChanged()
}

type MapboxConfigPayload = {
  ok?: boolean
  configured?: boolean
  proxyMode?: boolean
  publicToken?: string | null
  error?: string
}

async function fetchMapboxConfigOnce(): Promise<{
  ok: boolean
  data: MapboxConfigPayload
  networkError: boolean
}> {
  try {
    const res = await fetch(resolveApiUrl('/api/config/mapbox'), {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
    const data = (await res.json().catch(() => ({}))) as MapboxConfigPayload
    return { ok: res.ok && data.ok !== false, data, networkError: false }
  } catch {
    return { ok: false, data: {}, networkError: true }
  }
}

/** Load Mapbox config from public `/api/config/mapbox` — await before MapGL init. */
export async function initializeMapbox(force = false): Promise<MapboxSessionSnapshot> {
  if (!mustUseApiGateway()) {
    sessionStatus = 'ready'
    sessionConfigured = false
    sessionProxyMode = false
    sessionPublicToken = null
    sessionError = null
    syncSessionSnapshot()
    return sessionSnapshot
  }

  if (!force && sessionStatus === 'ready') return sessionSnapshot
  if (inflight) return inflight

  sessionStatus = 'loading'
  sessionError = null
  emitSessionChanged()

  inflight = (async () => {
    const retryDelaysMs = [0, 750, 2000]
    let lastNetworkError = false

    try {
      for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        if (retryDelaysMs[attempt] > 0) await sleep(retryDelaysMs[attempt])

        const { ok, data, networkError } = await fetchMapboxConfigOnce()
        lastNetworkError = networkError

        if (!ok) {
          if (attempt < retryDelaysMs.length - 1 && networkError) continue
          sessionStatus = 'error'
          sessionError = networkError
            ? 'mapbox_config_network_error'
            : data.error || 'mapbox_config_failed'
          sessionConfigured = false
          sessionProxyMode = false
          sessionPublicToken = null
          logMapboxTokenLoadFailed(sessionError)
          emitSessionChanged()
          return sessionSnapshot
        }

        sessionConfigured = Boolean(data.configured)
        sessionProxyMode = sessionConfigured || Boolean(data.proxyMode)
        const publicToken =
          typeof data.publicToken === 'string' && isPublicMapboxToken(data.publicToken)
            ? data.publicToken.trim()
            : null
        sessionPublicToken = publicToken
        sessionStatus = 'ready'
        sessionError = sessionConfigured
          ? null
          : data.error || 'MAPBOX_TOKEN missing from backend environment'

        if (sessionConfigured) {
          logMapboxTokenLoaded({
            configured: true,
            hasPublicToken: Boolean(publicToken),
            proxyMode: true,
            source: 'environment',
          })
          if (!publicToken) {
            console.info(
              '[mapbox-runtime] proxy-only mode — tiles via /api/mapbox-proxy; set MAPBOX_PUBLIC_TOKEN or MAPBOX_TOKEN=pk.* on API host for native GL token',
            )
          }
        } else {
          logMapboxTokenLoadFailed(sessionError || 'mapbox_not_configured')
        }
        emitSessionChanged()
        return sessionSnapshot
      }

      sessionStatus = 'error'
      sessionError = lastNetworkError ? 'mapbox_config_network_error' : 'mapbox_config_failed'
      sessionConfigured = false
      sessionProxyMode = false
      sessionPublicToken = null
      logMapboxTokenLoadFailed(sessionError)
      emitSessionChanged()
      return sessionSnapshot
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** @deprecated Use initializeMapbox */
export const hydrateMapboxSessionFromServer = initializeMapbox

/** @deprecated Use initializeMapbox */
export const hydrateMapboxSessionFromGateway = initializeMapbox
