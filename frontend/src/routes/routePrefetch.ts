/**
 * routePrefetch — single source of truth for every lazy() route module
 * in the app, exposed as a `prefetchRoute(path)` helper that NavMenu /
 * Home CTAs / sidebar links call on `pointerenter` / `focus` so the
 * destination chunk is already in the browser cache by the time the
 * user actually clicks.
 *
 * Why this matters:
 *   • Without prefetch, the first click on a heavy route (GisMap,
 *     SatelliteIntelligence, …) pays the full network +
 *     parse + compile cost on the critical path → the user sees a
 *     blank shell for the duration of the chunk download.
 *   • With prefetch on intent (≈ 80–250 ms before click on average),
 *     the chunk is already evaluated by the time React tries to
 *     render the lazy boundary → the navigation reads as instant.
 *
 * Design notes:
 *   • The map is keyed by the *exact* react-router path string used
 *     in `AppRoutes.tsx`. Custom / parameterised paths fall back to
 *     `getRoutePrefetcher(path)` returning `undefined` (no-op) so
 *     unknown paths are safe to call.
 *   • Each value is the same `() => import(...)` factory that the
 *     `lazy()` call uses. Vite hoists the dynamic-import URL once
 *     per module, so calling the factory pre-emptively warms exactly
 *     the chunk `lazy()` will request later — perfect dedup.
 *   • `prefetchRoute` is fire-and-forget; we swallow rejections
 *     because a network failure during prefetch is non-fatal (the
 *     normal `lazy()` re-attempt will surface it).
 */

type RouteFactory = () => Promise<unknown>

const ROUTE_FACTORIES: Record<string, RouteFactory> = {
  '/learn-more': () => import('../pages/LearnMore'),
  '/satellite': () => import('../pages/satellite/SatelliteIntelligenceMain'),
  '/satellite/indices': () => import('../pages/satellite/SatelliteIntelligenceMain'),
  '/satellite/multidimensional': () => import('../pages/satellite/Multidimensional'),
  '/satellite/gis': () => import('../pages/satellite/GisMap'),
  '/data/fertigation-records': () => import('../pages/data-entry/FertigationRecords'),
  '/data/recipes': () => import('../pages/data-entry/Recipes'),
  '/admin/github': () => import('../pages/admin/GitHubIntegration'),
  '/settings/api-integrations': () => import('../pages/settings/ApiIntegrations'),
  '/style-guide': () => import('../pages/StyleGuide'),
  '/usability-test': () => import('../pages/UsabilityTest'),
}

/* Module-level memo so each chunk is only fetched once even if a
 * jittery user re-hovers a link 20 times in a row. The first call
 * caches the in-flight Promise; subsequent calls return the same
 * Promise without a fresh `import()` call. */
const inflight = new Map<string, Promise<unknown>>()

export function prefetchRoute(path: string | undefined | null): void {
  if (!path) return
  /* Normalise: strip trailing slash, strip query/hash, and try
   * progressively shorter prefixes so `/data/recipes/fertigation`
   * still warms the `/data/recipes` chunk, `/satellite/indices?q=…`
   * still warms `/satellite/indices`, etc. */
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  const candidates = [clean]
  let head = clean
  while (head.includes('/')) {
    head = head.slice(0, head.lastIndexOf('/'))
    if (head) candidates.push(head)
  }
  for (const candidate of candidates) {
    const factory = ROUTE_FACTORIES[candidate]
    if (!factory) continue
    if (inflight.has(candidate)) return
    const p = factory().catch(() => {
      /* On failure, drop the cache entry so a future hover (or the
       * actual lazy() call) can retry the import cleanly. */
      inflight.delete(candidate)
    })
    inflight.set(candidate, p)
    return
  }
}

/* Optional: warm a specific factory by key — used by the App shell
 * to pre-warm "likely next" pages from the Home Hero (Satellite
 * Indices + Learn More) once the Hero has painted, so the user's
 * first click on either CTA is essentially free. */
export function prefetchRouteByKey(key: keyof typeof ROUTE_FACTORIES | string): void {
  prefetchRoute(key)
}

/* Internal accessor in case AppRoutes wants to reuse the same
 * factories via lazy() — keeps the dynamic-import URL list in one
 * place so adding a route is a one-line change here. */
export function getRouteFactories(): Readonly<Record<string, RouteFactory>> {
  return ROUTE_FACTORIES
}
