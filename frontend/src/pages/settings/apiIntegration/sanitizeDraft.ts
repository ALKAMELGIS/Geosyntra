import type { IntegrationDraft } from './types'

/** Removed from Mapbox connect form — not required for typical use. */
const MAPBOX_LEGACY_KEYS = [
  'publicToken',
  'secretToken',
  'username',
  'styleUrl',
  'tilesApiUrl',
  'mapboxToken',
] as const

export function sanitizeIntegrationDraft(draft: IntegrationDraft): IntegrationDraft {
  if (draft.providerId !== 'mapbox') return draft

  const config = { ...draft.config }
  for (const key of MAPBOX_LEGACY_KEYS) {
    delete config[key]
  }

  return {
    ...draft,
    authType: 'api_key',
    integrationType: draft.integrationType || 'Mapbox',
    provider: draft.provider || 'Mapbox',
    config,
  }
}

export function stripLegacyMapboxSecrets(secrets: Record<string, string>): Record<string, string> {
  const next = { ...secrets }
  for (const key of MAPBOX_LEGACY_KEYS) {
    delete next[key]
  }
  return next
}
