//! UI static bundle — Dioxus dx output preferred over Vite `frontend/dist`.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use tower_http::services::ServeDir;

#[cfg(feature = "dioxus-ssr")]
use geosyntra_web::ssr::{fullstack_state, render_route};

/// Resolve Dioxus web bundle (`dx build --platform web`).
pub fn resolve_web_dist() -> Option<PathBuf> {
    for key in ["GEOSYNTRA_WEB_DIST", "GEOSYNTRA_UI_DIST"] {
        if let Ok(raw) = std::env::var(key) {
            let path = PathBuf::from(raw.trim());
            if path.join("index.html").is_file() {
                return Some(path);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        for rel in [
            "target/dx/geosyntra-web/release/web/public",
            "target/dx/geosyntra-web/debug/web/public",
            "Geosyntra/target/dx/geosyntra-web/release/web/public",
            "Geosyntra/target/dx/geosyntra-web/debug/web/public",
        ] {
            let path = cwd.join(rel);
            if path.join("index.html").is_file() {
                return canonicalize_if_exists(&path);
            }
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for rel in [
        "../../target/dx/geosyntra-web/release/web/public",
        "../../target/dx/geosyntra-web/debug/web/public",
    ] {
        let path = manifest.join(rel);
        if path.join("index.html").is_file() {
            return canonicalize_if_exists(&path);
        }
    }

    None
}

/// Resolve Vite `frontend/dist` — mirrors Express `GEOSYNTRA_FRONTEND_DIST` / `FRONTEND_DIST`.
pub fn resolve_frontend_dist() -> Option<PathBuf> {
    for key in ["GEOSYNTRA_FRONTEND_DIST", "FRONTEND_DIST"] {
        if let Ok(raw) = std::env::var(key) {
            let path = PathBuf::from(raw.trim());
            if path.is_dir() {
                return Some(path);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        for rel in ["frontend/dist", "Geosyntra/frontend/dist"] {
            let path = cwd.join(rel);
            if path.is_dir() {
                return Some(path);
            }
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for rel in ["../../frontend/dist", "../../../frontend/dist"] {
        let path = manifest.join(rel);
        if path.is_dir() {
            return canonicalize_if_exists(&path);
        }
    }

    None
}

/// Prefer Dioxus bundle; fall back to legacy Vite dist.
pub fn resolve_ui_dist() -> Option<PathBuf> {
    resolve_web_dist().or_else(resolve_frontend_dist)
}

fn canonicalize_if_exists(path: &Path) -> Option<PathBuf> {
    if path.is_dir() {
        path.canonicalize().ok().or_else(|| Some(path.to_path_buf()))
    } else {
        None
    }
}

fn serve_dir(path: PathBuf) -> ServeDir {
    ServeDir::new(path)
        .precompressed_br()
        .precompressed_gzip()
}

/// Merge API router with static assets + Dioxus SSR (preferred) or SPA index fallback.
pub fn with_static_fallback(api: Router) -> Router {
    let Some(dist) = resolve_ui_dist() else {
        return api;
    };

    let index = dist.join("index.html");
    if !index.is_file() {
        return api;
    }

    let mut router = Router::new().merge(api);

    let assets = dist.join("assets");
    if assets.is_dir() {
        router = router.nest_service("/assets", serve_dir(assets));
    }

    let wasm = dist.join("wasm");
    if wasm.is_dir() {
        router = router.nest_service("/wasm", serve_dir(wasm));
    }

    #[cfg(feature = "dioxus-ssr")]
    if let Some(web_dist) = resolve_web_dist() {
        let fullstack = fullstack_state(&web_dist);
        return router.fallback(get(move |req: Request<Body>| {
            let fullstack = fullstack.clone();
            async move { render_route(fullstack, req).await }
        }));
    }

    let index_html = Arc::new(
        std::fs::read(&index).unwrap_or_else(|err| panic!("read {}: {err}", index.display())),
    );
    router.fallback(get(move |req: Request<Body>| {
        let index = index_html.clone();
        async move { spa_index_response(&req, index) }
    }))
}

fn spa_index_response(req: &Request<Body>, index: Arc<Vec<u8>>) -> Response {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return StatusCode::NOT_FOUND.into_response();
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(Body::from(index.as_ref().clone()))
        .unwrap()
}

/// GET-only SPA fallback when dist is unset (returns 404).
pub async fn spa_fallback(request: Request<Body>) -> Result<Response, std::convert::Infallible> {
    if request.method() != Method::GET {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }

    if let Some(dist) = resolve_ui_dist() {
        let index = dist.join("index.html");
        if let Ok(file) = tokio::fs::read(&index).await {
            return Ok(Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                .body(Body::from(file))
                .unwrap());
        }
    }

    Ok(StatusCode::NOT_FOUND.into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_dist_does_not_panic_when_missing() {
        let _ = resolve_web_dist();
        let _ = resolve_frontend_dist();
        let _ = resolve_ui_dist();
    }
}
