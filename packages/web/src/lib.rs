//! GeoSyntra Dioxus UI — Task 20+ foundation, Task 21 auth shell.

pub mod api;
pub mod api_client;
pub mod app;
pub mod auth_api;
pub mod auth_session;
pub mod components;
pub mod error_display;
pub mod gis;
pub mod gis_content_store;
pub mod i18n;
pub mod landing;
pub mod oauth_client;
pub mod onboarding;
pub mod pages;
pub mod post_login;
pub mod public_paths;
pub mod routes;
#[cfg(feature = "server")]
pub mod ssr;
pub mod wall_clock;
pub mod workspace;

pub use app::App;

/// Default dev API base when Axum runs on :3003.
pub fn default_api_base() -> String {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        // Browser: same-origin `/api` (dx dev proxy or future web-server proxy).
        if let Ok(base) = std::env::var("GEOSYNTRA_WEB_API_BASE") {
            if !base.trim().is_empty() {
                return base.trim().trim_end_matches('/').to_string();
            }
        }
        return String::new();
    }

    std::env::var("GEOSYNTRA_WEB_API_BASE")
        .or_else(|_| std::env::var("VITE_API_BASE_URL"))
        .unwrap_or_else(|_| "http://127.0.0.1:3003".into())
        .trim()
        .trim_end_matches('/')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::default_api_base;
    use crate::public_paths::{is_public_path, requires_app_access};

    #[test]
    fn default_api_base_falls_back_to_axum_dev_port() {
        unsafe {
            std::env::remove_var("GEOSYNTRA_WEB_API_BASE");
            std::env::remove_var("VITE_API_BASE_URL");
        }
        assert_eq!(default_api_base(), "http://127.0.0.1:3003");
    }

    #[test]
    fn public_paths_match_task_24_routing() {
        assert!(is_public_path("/"));
        assert!(is_public_path("/login"));
        assert!(requires_app_access("/dashboard"));
        assert!(requires_app_access("/admin"));
    }
}
