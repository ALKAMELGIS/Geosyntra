//! Dioxus SSR for Axum static serving (Task 26.3 staging / production single origin).

use std::path::Path;
use std::sync::{Arc, OnceLock};

use dioxus_server::axum::{
    body::Body,
    extract::State,
    http::{Method, Request, StatusCode},
    response::{IntoResponse, Response},
};
use dioxus_server::{FullstackState, ServeConfig};

use crate::App;

static FULLSTACK: OnceLock<Arc<FullstackState>> = OnceLock::new();

/// Shared Dioxus fullstack renderer — reads `index.html` from `web_dist/public` via `DIOXUS_PUBLIC_PATH`.
pub fn fullstack_state(web_dist: &Path) -> Arc<FullstackState> {
    FULLSTACK
        .get_or_init(|| {
            std::env::set_var(
                "DIOXUS_PUBLIC_PATH",
                web_dist.to_string_lossy().as_ref(),
            );
            Arc::new(FullstackState::new(ServeConfig::new(), App))
        })
        .clone()
}

/// SSR fallback for client-side routes (login, dashboard, GIS, etc.).
pub async fn render_route(fullstack: Arc<FullstackState>, req: Request<Body>) -> Response {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return StatusCode::NOT_FOUND.into_response();
    }

    FullstackState::render_handler(State((*fullstack).clone()), req).await
}
