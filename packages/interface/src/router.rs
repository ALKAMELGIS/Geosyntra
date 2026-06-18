use axum::{
    middleware,
    routing::{delete, get, patch, post, put},
    Router,
};

use crate::{
    ai, aoi, auth, billing, config, gateway, geo, github, governance, log, membership,
    middleware::AuthRateLimiter, middleware::cors_layer,
    platform, rbac, state::AppState, system, temporary_grant, tenant, user_tokens, weather,
};

async fn health() -> &'static str {
    "ok"
}

/// Full API router with auth + RBAC + billing routes, CORS, and auth rate limiting.
pub fn router(state: AppState) -> Router {
    let rate_limit = AuthRateLimiter::from_env();

    let auth_routes = Router::new()
        .route("/login", post(auth::login))
        .route("/register", post(auth::register))
        .route("/me", get(auth::me))
        .route("/refresh", post(auth::refresh))
        .route("/logout", post(auth::logout))
        .route("/logout-all", post(auth::logout_all))
        .route("/events", get(auth::auth_events))
        .route_layer(middleware::from_fn({
            let limiter = rate_limit.clone();
            move |req, next| {
                let limiter = limiter.clone();
                async move { limiter.limit(req, next).await }
            }
        }));

    Router::new()
        .route("/health", get(health))
        .route("/api/platform/health", get(platform::health))
        .route("/api/platform/runtime", get(platform::runtime))
        .route("/api/platform/env-health", get(platform::env_health))
        .route("/api/geo/grounding/status", get(geo::grounding_status))
        .route("/api/geo/grounding/invoke", post(geo::grounding_invoke))
        .route("/api/geo/locations", get(geo::list_locations).post(geo::create_location))
        .route("/api/aoi", get(aoi::list_aoi).post(aoi::create_aoi))
        .route("/api/aoi/{id}", delete(aoi::delete_aoi))
        .route("/api/weather/latest", get(weather::weather_latest))
        .route("/api/ai/analyze", post(ai::analyze))
        .route("/api/ai/chat", post(ai::chat))
        .route("/api/auth/oauth/config", get(auth::oauth_config))
        .route("/api/auth/email/status", get(auth::email_status))
        .route("/api/auth/forgot-password", post(auth::forgot_password))
        .route("/api/auth/reset-password", post(auth::reset_password))
        .route("/api/auth/resend-verification", post(auth::resend_verification))
        .route("/api/auth/forgot-username", post(auth::forgot_username))
        .route("/api/auth/verify-email", get(auth::verify_email))
        .route("/api/auth/apple", get(auth::apple_oauth))
        .route("/api/auth/apple/callback", get(auth::apple_oauth_callback))
        .route(
            "/api/auth/send-verification-email",
            post(auth::send_verification_email),
        )
        .route("/api/auth/google/exchange", post(auth::google_exchange))
        .route("/api/auth/github/exchange", post(auth::github_exchange))
        .route("/api/auth/linkedin/exchange", post(auth::linkedin_exchange))
        .route("/api/auth/apple/exchange", post(auth::apple_exchange))
        .route("/api/config/mapbox", get(config::mapbox_config))
        .route("/api/config/mapbox/public-token", get(config::mapbox_config))
        .route("/api/config/status", get(config::config_status))
        .route("/api/config/gemini", get(config::gemini_config))
        .route("/api/config/openai", get(config::openai_config))
        .route("/api/config/claude", get(config::claude_config))
        .route("/api/config/deepseek", get(config::deepseek_config))
        .route("/api/config/graphhopper", get(config::graphhopper_config))
        .route(
            "/api/config/openrouteservice",
            get(config::openrouteservice_config),
        )
        .route("/api/config/openweathermap", get(config::openweathermap_config))
        .route("/api/config/sentinel", get(config::sentinel_config))
        .route("/api/gateway/status", get(config::gateway_status))
        .route(
            "/api/gateway/mapbox/public-token",
            get(gateway::mapbox_public_token_route),
        )
        .route("/api/gateway/mapbox/proxy", get(gateway::mapbox_gateway_proxy))
        .route("/api/gateway/mapbox/geocoding", get(gateway::mapbox_geocoding))
        .route(
            "/api/gateway/sentinel/credentials",
            get(gateway::sentinel_credentials),
        )
        .route("/api/mapbox-proxy", get(gateway::mapbox_proxy))
        .route("/api/google-3d-tiles-proxy", get(gateway::google_3d_tiles_proxy))
        .route("/api/google-3d-tiles/root.json", get(gateway::google_3d_tiles_root))
        .route("/api/github/status", get(github::github_status))
        .route("/api/github/events", get(github::github_events))
        .route("/api/github/disconnect", post(github::github_disconnect))
        .route("/api/github/oauth/start", get(github::github_oauth_start))
        .route("/api/github/oauth/callback", get(github::github_oauth_callback))
        .route("/api/github/repos", get(github::github_repos))
        .route(
            "/api/github/repos/{owner}/{repo}/issues",
            get(github::github_repo_issues).post(github::github_create_issue),
        )
        .route(
            "/api/github/repos/{owner}/{repo}/pulls",
            get(github::github_repo_pulls),
        )
        .route(
            "/api/gateway/openrouteservice/{*path}",
            post(gateway::openrouteservice_proxy),
        )
        .route(
            "/api/gateway/graphhopper/{*path}",
            get(gateway::graphhopper_proxy),
        )
        .route(
            "/api/gateway/openweathermap/{*path}",
            get(gateway::openweathermap_proxy),
        )
        .route(
            "/api/gateway/gemini/generate-content",
            post(gateway::gemini_generate_content),
        )
        .route("/api/gateway/openai/chat", post(gateway::openai_chat))
        .route("/api/gateway/claude/messages", post(gateway::claude_messages))
        .route("/api/gateway/deepseek/chat", post(gateway::deepseek_chat))
        .route("/api/user/api-tokens/session", get(user_tokens::api_tokens_session))
        .route("/api/user/api-tokens", get(user_tokens::list_api_tokens))
        .route(
            "/api/user/api-tokens/{provider}",
            put(user_tokens::upsert_api_token).delete(user_tokens::delete_api_token),
        )
        .route("/api/system/tokens/status", get(system::tokens_status))
        .route("/api/system/tokens", get(system::list_tokens))
        .route(
            "/api/system/tokens/migrate-from-vault",
            post(system::migrate_from_vault),
        )
        .route(
            "/api/system/tokens/{name}",
            put(system::upsert_token).patch(system::patch_token),
        )
        .route(
            "/api/system/tokens/{name}/test",
            post(system::test_token),
        )
        .route("/api/log/client", post(log::client_log))
        .nest("/api/auth", auth_routes)
        .route("/api/rbac/me", get(billing::rbac_me))
        .route("/api/rbac/users", get(rbac::list_users).post(rbac::create_user))
        .route("/api/rbac/users/{id}/approve", post(rbac::approve_user))
        .route("/api/rbac/users/{id}/suspend", post(rbac::suspend_user))
        .route("/api/rbac/users/{id}/reactivate", post(rbac::reactivate_user))
        .route("/api/rbac/users/{id}", delete(rbac::delete_user))
        .route("/api/rbac/users/{id}", patch(rbac::patch_user))
        .route("/api/rbac/audit", get(rbac::list_audit))
        .route("/api/rbac/invites", get(rbac::list_invites))
        .route("/api/rbac/invites", post(rbac::create_invite))
        .route("/api/rbac/invites/preview", get(rbac::preview_invite))
        .route("/api/rbac/invites/accept", post(rbac::accept_invite))
        .route(
            "/api/rbac/permissions/matrix",
            get(rbac::permissions_matrix),
        )
        .route("/api/rbac/policies", get(rbac::list_policies).post(rbac::create_policy))
        .route(
            "/api/rbac/policies/{id}",
            get(rbac::get_policy)
                .patch(rbac::update_policy)
                .delete(rbac::delete_policy),
        )
        .route(
            "/api/rbac/policies/{id}/activate",
            post(rbac::activate_policy),
        )
        .route("/api/governance/proposals", get(governance::list_proposals).post(governance::create_proposal))
        .route(
            "/api/governance/proposals/pending-count",
            get(governance::pending_count),
        )
        .route(
            "/api/governance/proposals/{id}",
            get(governance::get_proposal),
        )
        .route(
            "/api/governance/proposals/{id}/approve",
            post(governance::approve_proposal),
        )
        .route(
            "/api/governance/proposals/{id}/reject",
            post(governance::reject_proposal),
        )
        .route("/api/platform/tenants", get(tenant::list_tenants).post(tenant::propose_tenant_create))
        .route("/api/platform/tenants/{id}", get(tenant::get_tenant))
        .route(
            "/api/platform/tenants/{id}/propose-update",
            post(tenant::propose_tenant_update),
        )
        .route("/api/platform/memberships", get(membership::list_memberships).post(membership::create_membership))
        .route(
            "/api/platform/memberships/{user_id}/{tenant_id}",
            get(membership::get_membership)
                .patch(membership::update_membership_role)
                .delete(membership::delete_membership),
        )
        .route("/api/platform/grants", get(temporary_grant::list_grants).post(temporary_grant::create_grant))
        .route("/api/platform/grants/{id}", delete(temporary_grant::revoke_grant))
        .route("/api/platform/config", get(platform::platform_settings))
        .route(
            "/api/platform/config/propose-update",
            post(platform::propose_config_update),
        )
        .route("/api/billing/plans", get(billing::list_plans))
        .route("/api/billing/me", get(billing::billing_me))
        .route("/api/billing/invoices", get(billing::list_invoices))
        .route("/api/billing/start-trial", post(billing::start_trial))
        .route("/api/billing/activate", post(billing::activate_plan))
        .route("/api/billing/payment-intent", post(billing::payment_intent))
        .route(
            "/api/billing/create-checkout-session",
            post(billing::create_checkout_session),
        )
        .route("/api/billing/confirm-payment", post(billing::confirm_payment))
        .route("/api/billing/bank-transfer", post(billing::bank_transfer))
        .route("/api/billing/webhook", post(billing::stripe_webhook))
        .layer(cors_layer())
        .with_state(state)
}

/// API router plus Vite static assets + SPA fallback when `frontend/dist` exists.
pub fn router_with_static(state: AppState) -> Router {
    crate::static_files::with_static_fallback(router(state))
}

/// Health-only router for tests without dependencies.
pub fn health_router() -> Router {
    Router::new().route("/health", get(health))
}
