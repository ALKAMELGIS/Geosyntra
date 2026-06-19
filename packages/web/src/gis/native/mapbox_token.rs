//! Mapbox GL init token — mirrors React `mapboxSessionToken.ts` / `mapboxAccessToken.ts`.
//!
//! Mapbox GL JS is the **rendering engine**; default basemap tiles are **Esri** (no Mapbox tile API).
//! GL still requires a `pk.*` string at init — use a placeholder when the API has no public token.

/// Placeholder pk.* for Esri/OSM-only raster mode (same as React `resolveMapboxGlProxyInitToken`).
pub const GL_INIT_PLACEHOLDER: &str = "pk.geosyntra.gl-init-placeholder";

/// Token passed to `mapboxgl.accessToken` — real pk.* from API when available, else placeholder.
pub fn resolve_gl_access_token(public_token: Option<&str>) -> String {
    if let Some(token) = public_token.map(str::trim).filter(|t| !t.is_empty()) {
        if token.starts_with("pk.") {
            return token.to_string();
        }
    }
    GL_INIT_PLACEHOLDER.to_string()
}

pub fn is_gl_init_placeholder(token: &str) -> bool {
    token.trim() == GL_INIT_PLACEHOLDER
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_public_pk_when_present() {
        assert_eq!(
            resolve_gl_access_token(Some("pk.test.real")),
            "pk.test.real"
        );
    }

    #[test]
    fn falls_back_to_placeholder_without_token() {
        assert_eq!(resolve_gl_access_token(None), GL_INIT_PLACEHOLDER);
        assert_eq!(resolve_gl_access_token(Some("")), GL_INIT_PLACEHOLDER);
        assert_eq!(resolve_gl_access_token(Some("sk.secret")), GL_INIT_PLACEHOLDER);
    }
}
