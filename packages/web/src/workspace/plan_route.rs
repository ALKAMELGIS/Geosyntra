use crate::auth_session::AuthSession;
use crate::workspace::state::{
    read_workspace_state, requires_upgrade_to_paid, sync_trial_expiry,
    WorkspaceLifecycle,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthPlanRoute {
    EnterWorkspace,
    ActivateProvisioned,
    ActivateTrial,
    OpenPayment,
    OpenPricing { upgrade: bool },
    EnterpriseSales,
}

fn is_platform_owner(session: &AuthSession) -> bool {
    session.has_permission("admin.tokens.manage")
        || session
            .role_slug
            .as_deref()
            .is_some_and(|s| matches!(s.to_ascii_lowercase().as_str(), "owner" | "super_admin"))
}

pub fn resolve_auth_plan_route(session: &AuthSession) -> AuthPlanRoute {
    if !session.is_signed_in() {
        return AuthPlanRoute::OpenPricing { upgrade: false };
    }

    if !session.is_email_verified() {
        return AuthPlanRoute::OpenPricing { upgrade: false };
    }

    if is_platform_owner(session) {
        return AuthPlanRoute::EnterWorkspace;
    }

    let email = session.email.as_deref().unwrap_or("");
    let tenant = session.active_tenant();

    if requires_upgrade_to_paid(tenant, email) {
        return AuthPlanRoute::OpenPricing { upgrade: true };
    }

    if let Some(state) = sync_trial_expiry(tenant, email).or_else(|| read_workspace_state(tenant, email)) {
        if state.workspace_ready && state.lifecycle != WorkspaceLifecycle::Expired {
            return AuthPlanRoute::EnterWorkspace;
        }
    }

    // Default new users → trial activation (Express signupPlan trial).
    AuthPlanRoute::ActivateTrial
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth_session::DEFAULT_TENANT_ID;

    #[test]
    fn owner_enters_workspace_directly() {
        let session = AuthSession {
            email: Some("admin@geosyntra.com".into()),
            role_slug: Some("owner".into()),
            permissions: vec!["admin.tokens.manage".into()],
            access_token: Some("jwt".into()),
            ..Default::default()
        };
        assert_eq!(resolve_auth_plan_route(&session), AuthPlanRoute::EnterWorkspace);
    }

    #[test]
    fn guest_opens_pricing() {
        let session = AuthSession::default();
        assert_eq!(
            resolve_auth_plan_route(&session),
            AuthPlanRoute::OpenPricing { upgrade: false }
        );
    }

    #[test]
    fn new_user_gets_trial_activation() {
        let session = AuthSession {
            email: Some("new@example.com".into()),
            tenant_id: Some(DEFAULT_TENANT_ID.into()),
            permissions: vec!["app.access".into()],
            access_token: Some("jwt".into()),
            ..Default::default()
        };
        assert_eq!(resolve_auth_plan_route(&session), AuthPlanRoute::ActivateTrial);
    }
}
