import { isPlatformOwnerUser, readCurrentUser } from './auth'

/** Platform API keys (Mapbox, Gemini, …) — add/edit/delete restricted to Owner. */
export function canManagePlatformApiTokens(): boolean {
  return isPlatformOwnerUser(readCurrentUser())
}

/** User-facing hint when a feature needs a key the user cannot configure. */
export function apiTokenUnavailableHint(featureLabel: string): string {
  if (canManagePlatformApiTokens()) {
    return `Add or update ${featureLabel} in Settings → API Manager.`
  }
  return `${featureLabel} is not available right now. Please contact your platform administrator.`
}
