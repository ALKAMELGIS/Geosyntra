/// <reference types="vite/client" />

/** Optional Vite env keys used by this app (documented in repo root `.env.example`). */
interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  /** Absolute URL for GET/PUT api-secrets when the UI is not served from the Node host (e.g. GitHub Pages). */
  readonly VITE_AGRI_API_SECRETS_URL?: string
  readonly VITE_AGRI_API_SECRETS_TOKEN?: string
  /** Optional GET/PUT base for cross-device profile sync (default `/api/v1/account/profile-extra`). */
  readonly VITE_AGRI_USER_PROFILE_URL?: string
  readonly VITE_AGRI_USER_PROFILE_TOKEN?: string
  /** Optional OAuth redirect URLs (IdP / backend handles token exchange). */
  readonly VITE_AUTH_GOOGLE_URL?: string
  readonly VITE_AUTH_APPLE_URL?: string
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
