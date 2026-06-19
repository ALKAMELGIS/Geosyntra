use crate::{
    api::billing,
    auth_session::AuthSession,
    routes::Route,
    workspace::{
        activate_trial_workspace, default_workspace_route, ensure_platform_owner_workspace,
        resolve_auth_plan_route, AuthPlanRoute,
    },
};

/// Post-login destination parity with React `resolveAuthPlanRoute` (Task 24.3).
pub async fn resolve_post_login_route(session: &AuthSession) -> Route {
    if session.is_signed_in() && !session.is_email_verified() {
        return Route::Landing {};
    }
    match resolve_auth_plan_route(session) {
        AuthPlanRoute::EnterWorkspace => {
            ensure_platform_owner_workspace(session);
            default_workspace_route()
        }
        AuthPlanRoute::ActivateProvisioned | AuthPlanRoute::ActivateTrial => {
            if let Some(token) = session.bearer() {
                let _ = billing::start_trial(token, 21).await;
            }
            activate_trial_workspace(session);
            default_workspace_route()
        }
        AuthPlanRoute::OpenPayment
        | AuthPlanRoute::OpenPricing { .. }
        | AuthPlanRoute::EnterpriseSales => Route::Landing {},
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth_session::DEFAULT_TENANT_ID;

    #[tokio::test]
    async fn owner_routes_to_satellite_workspace() {
        let session = AuthSession {
            email: Some("admin@geosyntra.com".into()),
            role_slug: Some("owner".into()),
            permissions: vec!["admin.tokens.manage".into()],
            access_token: Some("jwt".into()),
            ..Default::default()
        };
        let route = resolve_post_login_route(&session).await;
        assert!(matches!(route, Route::SatelliteIndices {}));
    }

    #[tokio::test]
    async fn trial_user_routes_to_satellite_after_activation() {
        let session = AuthSession {
            email: Some("trial@example.com".into()),
            tenant_id: Some(DEFAULT_TENANT_ID.into()),
            permissions: vec!["app.access".into()],
            access_token: Some("jwt".into()),
            ..Default::default()
        };
        let route = resolve_post_login_route(&session).await;
        assert!(matches!(route, Route::SatelliteIndices {}));
    }
}
