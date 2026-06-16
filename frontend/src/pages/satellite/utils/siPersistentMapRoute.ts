/** Canonical route for the single persistent Mapbox engine instance. */
export const SI_PERSISTENT_MAP_ROUTE = '/satellite/indices' as const;

export function isSiPersistentMapRoute(pathname: string): boolean {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  return normalized === SI_PERSISTENT_MAP_ROUTE;
}
