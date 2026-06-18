/// <reference types="vite/client" />

/** Optional Vite env keys used by this app (documented in repo root `.env.example`). */
interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  /** Absolute URL for GET/PUT api-secrets when the UI is not served from the Node host (e.g. GitHub Pages). */
  readonly VITE_GEOSYNTRA_API_SECRETS_URL?: string
  readonly VITE_GEOSYNTRA_API_SECRETS_TOKEN?: string
  /** @deprecated Use VITE_GEOSYNTRA_* — kept for backward compatibility */
  readonly VITE_AGRI_API_SECRETS_URL?: string
  readonly VITE_AGRI_API_SECRETS_TOKEN?: string
  /** Optional GET/PUT base for cross-device profile sync (default `/api/v1/account/profile-extra`). */
  readonly VITE_GEOSYNTRA_USER_PROFILE_URL?: string
  readonly VITE_GEOSYNTRA_USER_PROFILE_TOKEN?: string
  readonly VITE_AGRI_USER_PROFILE_URL?: string
  readonly VITE_AGRI_USER_PROFILE_TOKEN?: string
  /** Optional OAuth redirect URLs (IdP / backend handles token exchange). */
  readonly VITE_AUTH_GOOGLE_URL?: string
  readonly VITE_AUTH_APPLE_URL?: string
  /** Build Google authorize URL when `VITE_AUTH_GOOGLE_URL` is unset (uses `public/oauth-return.html` as redirect). */
  readonly VITE_AUTH_GOOGLE_CLIENT_ID?: string
  readonly VITE_AUTH_GOOGLE_REDIRECT_URI?: string
  readonly VITE_AUTH_APPLE_CLIENT_ID?: string
  readonly VITE_AUTH_APPLE_REDIRECT_URI?: string
  readonly VITE_AUTH_GITHUB_URL?: string
  readonly VITE_AUTH_GITHUB_CLIENT_ID?: string
  readonly VITE_AUTH_GITHUB_REDIRECT_URI?: string
  /** API origin for `POST /api/auth/google/exchange` when the SPA is not same-origin (e.g. `http://localhost:3001`). */
  readonly VITE_API_BASE_URL?: string
  /** Comma-separated emails always treated as Owner in the SPA (must match RBAC_SYSTEM_OWNER_EMAILS). */
  readonly VITE_RBAC_SYSTEM_OWNER_EMAILS?: string
  /** GitHub Pages — seed Owner in localStorage when no auth API. */
  readonly VITE_STATIC_OWNER_EMAIL?: string
  readonly VITE_STATIC_OWNER_BOOTSTRAP_PASSWORD?: string
  /** development | staging | production — staging shows a visible banner in the UI. */
  readonly VITE_GEOSYNTRA_ENV?: string
  /** OpenRouteService — Geo AI map routing (free tier at openrouteservice.org). */
  readonly VITE_OPENROUTESERVICE_API_KEY?: string
  readonly VITE_ORS_API_KEY?: string
  readonly VITE_OPENROUTE_SERVICE_API_KEY?: string
  /** GraphHopper — Route Map tool & street routing (graphhopper.com). */
  readonly VITE_GRAPHHOPPER_API_KEY?: string
  readonly VITE_GRAPHOPPER_API_KEY?: string
  /** Google Maps — Photorealistic 3D basemap local dev (Map Tiles API). Production uses backend GOOGLE_MAPS_SERVER_API_KEY. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_SERVER_API_KEY?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'calcite-action-group': import('react').DetailedHTMLProps<import('react').HTMLAttributes<HTMLElement>, HTMLElement> & {
        layout?: string
        'overlay-positioning'?: string
        scale?: string
        'selection-mode'?: string
        'calcite-hydrated'?: string
      }
    }
  }
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-icon-2x.png' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-icon.png' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-shadow.png' {
  const src: string
  export default src
}

export {}
