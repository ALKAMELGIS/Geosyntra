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
 * Geosyntra mark — minimal monochrome line work.
 * Pure outline hexagon + stylized G + a single satellite orbital arc, all stroked
 * with a soft white→silver→white glass gradient. No fills, no halo, no glow filters.
 * Renders crisp from 24px chips to 256px hero usage.
 */
export const GEOSYNTRA_BRAND_LOGO_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Geosyntra Geospatial AI" fill="none"><defs><linearGradient id="gs-line" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="50%" stop-color="#cbd5e1" stop-opacity="0.78"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.95"/></linearGradient></defs><path d="M32 6 L54.4 19 L54.4 45 L32 58 L9.6 45 L9.6 19 Z" stroke="url(#gs-line)" stroke-width="1.6" stroke-linejoin="round"/><path d="M42.4 23.5 A11.5 11.5 0 1 0 42.4 40.5 L34 40.5 L34 32 L28.6 32" stroke="url(#gs-line)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="32" cy="32" rx="20" ry="5.6" stroke="url(#gs-line)" stroke-width="0.9" opacity="0.45" transform="rotate(-22 32 32)"/></svg>`

/**
 * Substrings that uniquely identify earlier brand-mark SVGs we shipped (each version had a
 * distinct gradient / filter id). When `mergeWithDefaults` sees any of these in a persisted
 * `logoSvg`, it overrides with the latest `GEOSYNTRA_BRAND_LOGO_SVG`. This guarantees the
 * user always sees the current mark without nuking their other settings.
 */
export const LEGACY_BRAND_LOGO_SIGNATURES: readonly string[] = [
  'gs-halo',
  'gs-glow',
  'gs-stroke',
  'fa-solid fa-leaf',
]

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
