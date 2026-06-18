/** User-facing messages for API token save failures (Settings → API Manager). */
export function formatApiTokenSaveError(raw: string | undefined): string {
  const code = String(raw || '').trim()
  const lower = code.toLowerCase()

  if (!code || lower === 'network' || lower === 'network_error') {
    return 'Cannot reach the API server. Confirm api.geosyntra.org is online and try signing in again.'
  }
  if (lower.includes('owner_required') || lower.includes('only the platform owner')) {
    return 'Only the platform Owner can save API tokens. Sign in with an Owner account (e.g. admin@Geosyntra.com) or ask your administrator to set RBAC_SYSTEM_OWNER_EMAILS on the API server.'
  }
  if (lower.includes('token_store_unavailable') || lower.includes('no_db')) {
    return 'Token database is unavailable on the API server. On Hostinger, set GEOSYNTRA_DATA_DIR to a writable folder, restart the Node app, and ensure SQLite migrations ran.'
  }
  if (lower.includes('mapbox_env_only')) {
    return 'Mapbox is configured on the server via Hostinger MAPBOX_TOKEN — not in API Manager.'
  }
  if (lower.includes('unauthorized') || lower.includes('invalid_token') || lower.includes('user_not_found')) {
    return 'Session expired or invalid. Sign out and sign in again, then retry saving the API key.'
  }
  if (lower.includes('invalid or missing x-agri-api-secrets-token')) {
    return 'API vault rejected the request. Remove GEOSYNTRA_API_SECRETS_TOKEN on the server or sign in as Owner so JWT auth is accepted.'
  }
  if (lower.includes('unknown_token')) {
    return 'This integration type is not registered on the API server yet. Deploy the latest backend and restart Node.js on Hostinger.'
  }
  if (lower.includes('token_persist_failed')) {
    return 'Server could not write the token to SQLite. Check GEOSYNTRA_DATA_DIR permissions and restart the Node app on Hostinger.'
  }

  return code
}
