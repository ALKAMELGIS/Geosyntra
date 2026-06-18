use crate::auth_session::AuthSession;
use crate::workspace::state::{
    is_platform_owner, read_workspace_state, requires_upgrade_to_paid, sync_trial_expiry,
    trial_days_remaining, WorkspaceLifecycle,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HomeHeroAccessMode {
    Start,
    Trial,
}

/// Guests and setup users see trial CTA; subscribed users see Start.
pub fn resolve_home_hero_access_mode(session: &AuthSession) -> HomeHeroAccessMode {
    if !session.is_signed_in() {
        return HomeHeroAccessMode::Trial;
    }
    if is_platform_owner(session) {
        return HomeHeroAccessMode::Start;
    }
    let email = session.email.as_deref().unwrap_or("");
    let tenant = session.active_tenant();
    if requires_upgrade_to_paid(tenant, email) {
        return HomeHeroAccessMode::Trial;
    }
    let ws = sync_trial_expiry(tenant, email).or_else(|| read_workspace_state(tenant, email));
    let Some(ws) = ws else {
        return HomeHeroAccessMode::Trial;
    };
    if ws.workspace_ready && ws.lifecycle != WorkspaceLifecycle::Expired {
        return HomeHeroAccessMode::Start;
    }
    if ws.lifecycle == WorkspaceLifecycle::Active {
        return HomeHeroAccessMode::Start;
    }
    if ws.lifecycle == WorkspaceLifecycle::Trialing {
        let days = trial_days_remaining(&ws);
        return if days.is_none_or(|d| d > 0) {
            HomeHeroAccessMode::Start
        } else {
            HomeHeroAccessMode::Trial
        };
    }
    HomeHeroAccessMode::Trial
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::state::{write_workspace_state, WorkspaceState};

    #[test]
    fn guest_sees_trial_cta() {
        assert_eq!(
            resolve_home_hero_access_mode(&AuthSession::default()),
            HomeHeroAccessMode::Trial
        );
    }

    #[test]
    fn active_workspace_sees_start() {
        let session = AuthSession {
            email: Some("hero-start@example.com".into()),
            tenant_id: Some("geosyntra-default".into()),
            access_token: Some("t".into()),
            ..Default::default()
        };
        write_workspace_state(WorkspaceState {
            email: "hero-start@example.com".into(),
            tenant_id: "geosyntra-default".into(),
            lifecycle: WorkspaceLifecycle::Active,
            workspace_ready: true,
            trial_ends_at_ms: None,
            updated_at_ms: 0,
        });
        assert_eq!(
            resolve_home_hero_access_mode(&session),
            HomeHeroAccessMode::Start
        );
    }
}
