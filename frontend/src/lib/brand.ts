/**
 * Single source of truth for the Geosyntra brand identity surfaced in chrome.
 *
 * - `GEOSYNTRA_BRAND_NAME`     — canonical product name. NEVER call it "Agro Cloud" / "Geosyntra Platform".
 * - `GEOSYNTRA_BRAND_NAME_AR`  — Arabic display name.
 * - `GEOSYNTRA_BRAND_TAGLINE`  — short subtitle used by the social meta + login chrome.
 * - `GEOSYNTRA_BRAND_LOGO_SVG` — inline AI-glass mark (cyan → indigo → violet) rendered inside `.logo-icon`.
 * - `LEGACY_BRAND_NAME_PATTERN` — used by `settingsStorage.mergeWithDefaults` to overwrite stale persisted
 *   brand strings (Agro / Agri Cloud, Geosyntra Platform, etc.) so existing users instantly see the new
 *   identity without nuking the rest of their saved settings.
 * - `LEGACY_BRAND_ICON_CLASSES` — Font Awesome classes that used to ship with the agro era; if any of
 *   them is found in storage we bring the icon back to the default.
 */

export const GEOSYNTRA_BRAND_NAME = 'Geosyntra'
export const GEOSYNTRA_BRAND_NAME_AR = 'جيوسينترا'
export const GEOSYNTRA_BRAND_TAGLINE = 'Geospatial AI'
export const GEOSYNTRA_BRAND_TAGLINE_AR = 'الذكاء الجيومكاني'
export const GEOSYNTRA_BRAND_FULL_NAME = `${GEOSYNTRA_BRAND_NAME} · ${GEOSYNTRA_BRAND_TAGLINE}`

export const GEOSYNTRA_BRAND_ICON_FALLBACK = 'fa-solid fa-hexagon-nodes'

/**
 * AI-glass mark. Hexagon + stylized G + halo + two glow nodes; renders crisp at 36–64px.
 * Strokes use a cyan→indigo→violet gradient that matches the rest of the AI theme tokens.
 */
export const GEOSYNTRA_BRAND_LOGO_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Geosyntra Geospatial AI"><defs><linearGradient id="gs-stroke" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#5eead4"/><stop offset="50%" stop-color="#a5b4fc"/><stop offset="100%" stop-color="#f0abfc"/></linearGradient><radialGradient id="gs-halo" cx="32" cy="32" r="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee" stop-opacity="0.55"/><stop offset="55%" stop-color="#818cf8" stop-opacity="0.22"/><stop offset="100%" stop-color="#c084fc" stop-opacity="0"/></radialGradient><filter id="gs-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="32" cy="32" r="28" fill="url(#gs-halo)"/><path d="M32 5 L55.4 18.5 L55.4 45.5 L32 59 L8.6 45.5 L8.6 18.5 Z" fill="none" stroke="url(#gs-stroke)" stroke-width="2.6" stroke-linejoin="round" opacity="0.95"/><path d="M44 24 A12 12 0 1 0 44 40 L36 40 L36 32 L30 32" fill="none" stroke="url(#gs-stroke)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="32" cy="32" rx="20" ry="6" fill="none" stroke="url(#gs-stroke)" stroke-width="1.1" opacity="0.5" transform="rotate(-22 32 32)"/><circle cx="55.4" cy="18.5" r="2.4" fill="#22d3ee" filter="url(#gs-glow)"/><circle cx="8.6" cy="45.5" r="2.0" fill="#c084fc" filter="url(#gs-glow)"/><circle cx="32" cy="59" r="1.8" fill="#818cf8" filter="url(#gs-glow)"/></svg>`

/** Legacy product names users may have persisted in localStorage from older sessions. */
export const LEGACY_BRAND_NAME_PATTERN =
  /^(?:\s*)(?:agro\s*cloud|agri[\s-]?cloud|agricloud|aac|geosyntra\s*platform|geosyntra\s*ai|agro)(?:\s*)$/i

/** Legacy Arabic product names (Agro Cloud Arabic, etc.). */
export const LEGACY_BRAND_NAME_PATTERN_AR =
  /(?:أجريكلاود|أجري\s*كلاود|اجري\s*كلاود|أجرو\s*كلاود|اجرو\s*كلاود|منصة\s*أجرو|منصة\s*جيوسينترا)/

/** Header icon classes that shipped with the Agro Cloud era. */
export const LEGACY_BRAND_ICON_CLASSES = new Set([
  'fa-solid fa-leaf',
  'fa-solid fa-seedling',
  'fa-solid fa-tractor',
  'fa-leaf',
  'fa-seedling',
])
