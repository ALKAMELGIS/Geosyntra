//! Interface layer — Axum routes, middleware, and HTTP mappers (Task 12–13).

pub mod account;
pub mod ai;
pub mod aoi;
pub mod auth;
pub mod billing;
pub mod config;
pub mod env_config;
pub mod error;
pub mod extract;
pub mod gateway;
pub mod geo;
pub mod github;
pub mod governance;
pub mod log;
pub mod membership;
pub mod middleware;
pub mod platform;
pub mod rbac;
pub mod route_catalog;
pub mod router;
pub mod state;
pub mod static_files;
pub mod system;
pub mod temporary_grant;
pub mod tenant;
pub mod user_tokens;
pub mod weather;

pub use auth::handlers::app_state;
pub use error::AppErrorResponse;
pub use route_catalog::IMPLEMENTED_ROUTES;
pub use router::{health_router, router, router_with_static};
pub use static_files::{resolve_frontend_dist, with_static_fallback};
pub use state::{
    AppState, AuthLifecycleUseCases, GovernanceUseCases, MembershipUseCases, PolicyUseCases,
    RbacUseCases, TemporaryGrantUseCases, TenantUseCases,
};

#[cfg(test)]
mod tests {
    use super::health_router;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_router_returns_ok() {
        let app = health_router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"ok");
    }
}
