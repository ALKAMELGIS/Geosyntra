/**
 * Mapbox token from build-time env only. Never embed real tokens in source
 * (GitHub push protection / secret scanning).
 */
export function getMapboxAccessToken(): string {
  const raw = import.meta.env.VITE_MAPBOX_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
}
