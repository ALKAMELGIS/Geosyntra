import type { Page, TestInfo } from 'playwright/test'

export type ConsoleIssue = {
  kind: 'console' | 'pageerror' | 'request'
  text: string
}

/** Known harmless browser/dev noise — add sparingly with a comment in git. */
const ALLOWED_PATTERNS: RegExp[] = [
  /WEBGL_debug_renderer_info is deprecated/i,
  /texSubImage: Alpha-premult/i,
  /Layout was forced before the page was fully loaded/i,
  /Download the React DevTools/i,
  /Cross-Origin Request Blocked.*events\.mapbox\.com/i,
  /CORS request did not succeed.*events\.mapbox\.com/i,
  /Failed to load resource: the server responded with a status of 401 \(\)/i,
  /Unimplemented type:/i,
  // Aborted mapbox-proxy tile/style fetches during SPA navigation or reload.
  /Error: Failed to fetch .*\/api\/mapbox-proxy/i,
  /^Error$/i,
  /Failed to load resource: the server responded with a status of 400 \(Bad Request\)/i,
  // React GIS iframe — optional SI endpoints / dev proxies (Task 30 embed).
  /Content Security Policy directive/i,
  /api\/system\/api-vault/i,
  /api\/analysis-engine\/mpc\/templates/i,
  /api\/auth\/refresh/i,
  /api\/v1\/admin\/directory/i,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/i,
  /Failed to load resource: the server responded with a status of 405 \(Method Not Allowed\)/i,
  /Failed to load resource: the server responded with a status of 500 \(Internal Server Error\)/i,
  /WebSocket connection to 'ws:\/\/localhost:3002\/' failed/i,
  /Failed to load resource: net::ERR_CONNECTION_REFUSED/i,
  // Mapbox GL init placeholder token — session SKU calls fail without real pk.*
  /api\.mapbox\.com\/map-sessions/i,
  /Failed to load resource: the server responded with a status of 403 \(\)/i,
]

function isAllowed(text: string): boolean {
  if (process.env.PLAYWRIGHT_ALLOW_CONSOLE === '1') return true
  const firstLine = text.split('\n')[0]?.trim() ?? text
  if (/^Error: Failed to fetch$/i.test(firstLine)) return true
  return ALLOWED_PATTERNS.some((re) => re.test(text))
}

export function attachConsoleMonitor(page: Page, bucket: ConsoleIssue[]) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (!isAllowed(text)) {
      bucket.push({ kind: 'console', text })
    }
  })

  page.on('pageerror', (err) => {
    const text = err.message || String(err)
    if (!isAllowed(text)) {
      bucket.push({ kind: 'pageerror', text })
    }
  })

  page.on('response', (response) => {
    const url = response.url()
    const status = response.status()
    if (status < 400) return

    const line = `HTTP ${status} ${url}`

    // Mapbox direct tile 403 = URL-restricted token not proxied — must fix.
    if (url.includes('api.mapbox.com')) {
      if (!isAllowed(line)) {
        bucket.push({ kind: 'request', text: line })
      }
      return
    }

    // Pre-auth RBAC probe before login — expected 400/401.
    if (url.includes('/api/rbac/me') && (status === 400 || status === 401)) {
      return
    }

    // Unknown policy id in admin detail — expected 400/404.
    if (url.includes('/api/rbac/policies/') && (status === 400 || status === 404)) {
      return
    }

    // Trial / forbidden admin probes during role-matrix redirects.
    if (url.includes('/api/admin/') && (status === 400 || status === 403)) {
      return
    }

    // React GIS iframe (Vite :5173) — optional probes while map shell loads.
    if (url.includes('127.0.0.1:5173') || url.includes('localhost:5173')) {
      if (status === 400 || status === 404 || status === 405 || status === 500) {
        return
      }
    }

    // GeoSyntra API errors during E2E (ignore favicon 404).
    if (url.includes('/api/') && !url.includes('favicon')) {
      if (!isAllowed(line)) {
        bucket.push({ kind: 'request', text: line })
      }
    }
  })
}

export async function assertCleanConsole(
  bucket: ConsoleIssue[],
  testInfo: TestInfo,
): Promise<void> {
  if (bucket.length === 0) return
  const body = bucket.map((i) => `[${i.kind}] ${i.text}`).join('\n')
  await testInfo.attach('browser-console-issues', {
    body,
    contentType: 'text/plain',
  })
  throw new Error(
    `Browser console/network issues (${bucket.length}):\n${body}\n` +
      'Fix app or bridge code, then re-run Playwright until clean.',
  )
}
