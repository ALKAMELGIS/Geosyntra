//! CORS configuration — mirrors Express `corsOrigins.js`.

use axum::http::{HeaderValue, Method};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub fn resolve_cors_origins() -> Vec<String> {
    let app_origin = std::env::var("APP_ORIGIN")
        .unwrap_or_else(|_| "http://localhost:5173".into())
        .trim()
        .to_string();

    let extra: Vec<String> = std::env::var("CORS_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let defaults = [
        app_origin,
        "http://localhost:5173".into(),
        "http://127.0.0.1:5173".into(),
        "http://localhost:8080".into(),
        "http://127.0.0.1:8080".into(),
        "https://www.geosyntra.org".into(),
        "https://geosyntra.org".into(),
        "http://www.geosyntra.org".into(),
        "http://geosyntra.org".into(),
        "https://alkamelgis.github.io".into(),
    ];

    let mut seen = std::collections::HashSet::new();
    defaults
        .into_iter()
        .chain(extra)
        .filter(|origin| seen.insert(origin.clone()))
        .collect()
}

pub fn cors_layer() -> CorsLayer {
    let origins: Vec<HeaderValue> = resolve_cors_origins()
        .iter()
        .filter_map(|o| HeaderValue::from_str(o).ok())
        .collect();

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_include_localhost() {
        let origins = resolve_cors_origins();
        assert!(origins.iter().any(|o| o.contains("localhost:5173")));
    }
}
