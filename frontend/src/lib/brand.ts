/**
 * Single source of truth for the Geosyntra brand identity surfaced in chrome.
 *
 * - `GEOSYNTRA_BRAND_NAME`     — canonical product name. NEVER call it "Agro Cloud" / "Geosyntra Platform".
 * - `GEOSYNTRA_BRAND_NAME_AR`  — Arabic display name.
 * - `GEOSYNTRA_BRAND_TAGLINE`  — short subtitle used by the social meta + login chrome.
 * - `GEOSYNTRA_BRAND_LOGO_SVG` — inline hex + G/L monogram + orbital arc (stroke-only, no raster).
 * - `LEGACY_BRAND_NAME_PATTERN` — used by `settingsStorage.mergeWithDefaults` to overwrite stale persisted
 *   brand strings (Agro / Agri Cloud, Geosyntra Platform, etc.) so existing users instantly see the new
 *   identity without nuking the rest of their saved settings.
 * - `LEGACY_BRAND_ICON_CLASSES` — Font Awesome classes that used to ship with the agro era; if any of
 *   them is found in storage we bring the icon back to the default.
 */

export const GEOSYNTRA_BRAND_NAME = 'GeoSyntra'
export const GEOSYNTRA_BRAND_NAME_AR = 'جيوسينترا'
export const GEOSYNTRA_BRAND_TAGLINE = 'Geospatial AI'
export const GEOSYNTRA_BRAND_TAGLINE_AR = 'الذكاء الجيومكاني'
/** Browser tab / install name — product name only (no tagline). */
export const GEOSYNTRA_BRAND_FULL_NAME = GEOSYNTRA_BRAND_NAME

export const GEOSYNTRA_BRAND_ICON_FALLBACK = 'fa-solid fa-hexagon-nodes'

/**
 * Geosyntra mark — hexagon frame, stylized G + L monogram, single orbital arc.
 * Stroke-only vector (no fills / filters) so it stays crisp at every size.
 * `preserveAspectRatio` keeps the hex from stretching inside square chips.
 */
export const GEOSYNTRA_BRAND_LOGO_SVG = `<svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Geosyntra Geospatial AI" fill="none"><defs><linearGradient id="gs-line" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.96"/><stop offset="48%" stop-color="#cbd5e1" stop-opacity="0.82"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.96"/></linearGradient></defs><path d="M32 6 L54.4 19 L54.4 45 L32 58 L9.6 45 L9.6 19 Z" stroke="url(#gs-line)" stroke-width="1.65" stroke-linejoin="round"/><path d="M41.2 24.2 A10.2 10.2 0 1 0 41.2 39.8 H33.2 V31.4 H27.4 V41.2 H35.2" stroke="url(#gs-line)" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/><ellipse class="gs-brand-orbit" cx="32" cy="32" rx="19.2" ry="5.4" stroke="url(#gs-line)" stroke-width="0.95" opacity="0.48" transform="rotate(-24 32 32)"/></svg>`

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
  'A11.5 11.5 0 1 0 42.4 40.5',
  '28.6 32',
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

/** Clone the mark SVG with a unique gradient id (multiple instances per page). */
export function brandLogoSvgWithGradientId(gradientId: string): string {
  return GEOSYNTRA_BRAND_LOGO_SVG.replaceAll('id="gs-line"', `id="${gradientId}"`).replaceAll(
    'url(#gs-line)',
    `url(#${gradientId})`,
  )
}
