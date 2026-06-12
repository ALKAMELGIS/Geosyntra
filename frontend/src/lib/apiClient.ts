import { readAccessToken } from './auth'

/** Production API host when GitHub Pages build omits VITE_API_BASE_URL. */
export const PRODUCTION_API_BASE_URL = 'https://api.geosyntra.org'

function configuredApiBase(): string {
  return String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
}

function readHtmlApiBaseMeta(): string {
  if (typeof document === 'undefined') return ''
  const raw = document.querySelector('meta[name="geosyntra-api-base"]')?.getAttribute('content')?.trim()
  return raw ? raw.replace(/\/+$/, '') : ''
}

function productionApiBaseFallback(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname.toLowerCase()
  if (
    host === 'geosyntra.org' ||
    host === 'www.geosyntra.org' ||
    host.endsWith('.geosyntra.org')
  ) {
    return PRODUCTION_API_BASE_URL
  }
  if (host.endsWith('github.io') || host.endsWith('github.dev')) return PRODUCTION_API_BASE_URL
  return readHtmlApiBaseMeta()
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

/** In local dev, prefer same-origin /api via Vite proxy instead of cross-origin localhost:3001. */
function devProxyApiBase(configured: string): string {
  if (!import.meta.env.DEV || typeof window === 'undefined' || !configured) return configured
  try {
    const api = new URL(configured)
    if (!isLocalHostname(window.location.hostname) || !isLocalHostname(api.hostname)) return configured
    return ''
  } catch {
    return configured
  }
}

function apiBase(): string {
  const configured = configuredApiBase()
  if (configured) return devProxyApiBase(configured)
  return productionApiBaseFallback()
}

function isStaticHostingHost(): boolean {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  if (host.endsWith('github.io') || host.endsWith('github.dev')) return true
  // Production UI is GitHub Pages; Node API is on api.geosyntra.org (or VITE_API_BASE_URL).
  return host === 'geosyntra.org' || host === 'www.geosyntra.org'
}

/** True when the SPA can reach the workspace API (explicit base URL or same-origin proxy). */
export function isWorkspaceApiConfigured(): boolean {
  if (apiBase()) return true
  if (typeof window === 'undefined') return false
  return !isStaticHostingHost()
}

export function resolveApiUrl(path: string): string {
  const base = apiBase()
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

/**
 * Mapbox GL fetches tiles inside Web Workers where relative URLs are invalid for `Request`.
 * Always resolve same-origin `/api/*` paths to an absolute href in the browser.
 */
export function resolveAbsoluteUrl(urlOrPath: string): string {
  if (typeof window === 'undefined') return urlOrPath
  try {
    return new URL(urlOrPath).href
  } catch {
    return new URL(urlOrPath, window.location.origin).href
  }
}

/** User-facing message when fetch() fails before an HTTP response (backend down, CORS, offline). */
export function describeWorkspaceFetchError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const lower = raw.toLowerCase()
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request failed')) {
    if (import.meta.env.DEV) {
      return 'Cannot reach the GeoSyntra API. Start the backend (npm run dev in backend/, port 3001) and refresh.'
    }
    return 'Cannot reach the GeoSyntra API. Check your connection or try again later.'
  }
  return raw || 'Network error'
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra as Record<string, string>),
  }
  const token = readAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/** Authenticated fetch — Bearer JWT + HttpOnly cookie (credentials). */
const workspaceInflight = new Map<string, Promise<{ ok: boolean; status: number; data: unknown }>>();

function workspaceFetchKey(path: string, init?: RequestInit): string {
  const method = (init?.method ?? 'GET').toUpperCase();
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams
        ? init.body.toString()
        : '';
  return `${method}|${path}|${body}`;
}

export async function workspaceFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const dedupe = method === 'GET' || method === 'HEAD';
  const key = workspaceFetchKey(path, init);

  if (dedupe) {
    const pending = workspaceInflight.get(key);
    if (pending) return pending as Promise<{ ok: boolean; status: number; data: T }>;
  }

  const task = (async () => {
    try {
      const res = await fetch(resolveApiUrl(path), {
        ...init,
        credentials: 'include',
        headers: authHeaders(init?.headers),
      });
      const data = (await res.json().catch(() => ({}))) as T;
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: 'network_error' } as T };
    }
  })();

  if (dedupe) {
    workspaceInflight.set(key, task as Promise<{ ok: boolean; status: number; data: unknown }>);
    task.finally(() => workspaceInflight.delete(key));
  }

  return task;
}
