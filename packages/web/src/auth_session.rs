use std::cell::RefCell;

use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use crate::error_display::ApiError;

const STORAGE_KEY: &str = "geosyntra_auth_v1";
pub const DEFAULT_TENANT_ID: &str = "geosyntra-default";

thread_local! {
    static SESSION: RefCell<AuthSession> = RefCell::new(AuthSession::default());
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct AuthSession {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub role_slug: Option<String>,
    pub status: Option<String>,
    #[serde(default, alias = "tenantId")]
    pub tenant_id: Option<String>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default, alias = "userId")]
    pub user_id: Option<String>,
}

impl AuthSession {
    pub fn read_local() -> Self {
        load_persisted().unwrap_or_else(Self::read_memory)
    }

    pub fn read_memory() -> Self {
        SESSION.with(|s| s.borrow().clone())
    }

    pub fn write(session: AuthSession) {
        SESSION.with(|s| *s.borrow_mut() = session.clone());
        save_persisted(&session);
    }

    pub fn clear() {
        Self::write(Self::default());
        clear_persisted();
    }

    pub fn bearer(&self) -> Option<&str> {
        self.access_token.as_deref().filter(|t| !t.is_empty())
    }

    pub fn is_signed_in(&self) -> bool {
        self.bearer().is_some()
    }

    /// Email/password accounts must confirm inbox before workspace access (React parity).
    pub fn is_email_verified(&self) -> bool {
        if self.is_owner() {
            return true;
        }
        if self.status.as_deref().is_some_and(|s| {
            s.eq_ignore_ascii_case("Pending Verification")
                || s.eq_ignore_ascii_case("Pending Approval")
        }) {
            return false;
        }
        true
    }

    pub fn can_access_app(&self) -> bool {
        self.is_signed_in()
            && self.is_email_verified()
            && (self.has_permission("app.access") || self.can_access_admin())
    }

    pub fn active_tenant(&self) -> &str {
        self.tenant_id
            .as_deref()
            .filter(|t| !t.is_empty())
            .unwrap_or(DEFAULT_TENANT_ID)
    }

    pub fn has_permission(&self, slug: &str) -> bool {
        self.permissions.iter().any(|p| p == slug)
    }

    /// Legacy helper — prefer `has_permission("admin.panel")`.
    pub fn is_owner(&self) -> bool {
        self.has_permission("admin.tokens.manage")
            || self.role_slug
                .as_deref()
                .is_some_and(|s| matches!(s.to_ascii_lowercase().as_str(), "owner" | "super_admin"))
    }

    pub fn can_access_admin(&self) -> bool {
        self.has_permission("admin.panel")
    }

    pub fn can_manage_api_integrations(&self) -> bool {
        self.has_permission("admin.settings.manage") || self.has_permission("admin.tokens.read")
    }

    pub fn display_name(&self) -> String {
        self.name
            .clone()
            .or_else(|| self.email.clone())
            .unwrap_or_else(|| "User".into())
    }
}

#[derive(Clone, Copy)]
pub struct AuthContext {
    pub session: Signal<AuthSession>,
    pub error: Signal<Option<String>>,
    pub busy: Signal<bool>,
}

impl AuthContext {
    pub fn provide(session: AuthSession) -> Self {
        let ctx = Self {
            session: Signal::new(session),
            error: Signal::new(None),
            busy: Signal::new(false),
        };
        use_context_provider(|| ctx);
        ctx
    }

    pub fn use_auth() -> Self {
        use_context::<AuthContext>()
    }

    pub fn set_session(mut self, session: AuthSession) {
        AuthSession::write(session.clone());
        self.session.set(session);
        self.error.set(None);
    }

    pub fn sign_out(mut self) {
        AuthSession::clear();
        self.session.set(AuthSession::default());
        self.error.set(None);
    }
}

pub async fn restore_session_from_api(session: AuthSession) -> Result<AuthSession, ApiError> {
    let token = session
        .bearer()
        .ok_or_else(|| ApiError::Http {
            status: 401,
            message: "missing token".into(),
        })?
        .to_string();
    crate::auth_api::fetch_me(&token).await
}

fn load_persisted() -> Option<AuthSession> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        return load_persisted_web();
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        None
    }
}

fn save_persisted(session: &AuthSession) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        save_persisted_web(session);
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        let _ = session;
    }
}

fn clear_persisted() {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        clear_persisted_web();
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn load_persisted_web() -> Option<AuthSession> {
    use wasm_bindgen::JsCast;
    let window = web_sys::window()?;
    let storage = window.local_storage().ok()??;
    let raw = storage.get_item(STORAGE_KEY).ok()??;
    serde_json::from_str(&raw).ok()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn save_persisted_web(session: &AuthSession) {
    if !session.is_signed_in() {
        clear_persisted_web();
        return;
    }
    if let Ok(raw) = serde_json::to_string(session) {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                let _ = storage.set_item(STORAGE_KEY, &raw);
            }
        }
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn clear_persisted_web() {
    if let Some(window) = web_sys::window() {
        if let Ok(Some(storage)) = window.local_storage() {
            let _ = storage.remove_item(STORAGE_KEY);
        }
    }
}

pub fn describe_session_error(err: &ApiError) -> String {
    err.user_message()
}

#[cfg(test)]
mod tests {
    use super::{AuthSession, SESSION};

    #[test]
    fn session_round_trip_memory() {
        SESSION.with(|_| {
            AuthSession::clear();
            let session = AuthSession {
                access_token: Some("jwt-test".into()),
                email: Some("admin@geosyntra.com".into()),
                role: Some("Owner".into()),
                role_slug: Some("owner".into()),
                tenant_id: Some("geosyntra-default".into()),
                permissions: vec!["admin.panel".into(), "admin.tokens.manage".into()],
                ..Default::default()
            };
            AuthSession::write(session);
            let read = AuthSession::read_memory();
            assert!(read.is_signed_in());
            assert!(read.can_access_admin());
            assert!(read.has_permission("admin.tokens.manage"));
        });
    }

    #[test]
    fn trial_user_lacks_admin_panel() {
        let session = AuthSession {
            permissions: vec!["app.access".into(), "aoi.read".into()],
            ..Default::default()
        };
        assert!(!session.can_access_admin());
        assert!(!session.can_manage_api_integrations());
    }

    #[test]
    fn pending_verification_blocks_app_access() {
        let session = AuthSession {
            access_token: Some("jwt".into()),
            status: Some("Pending Verification".into()),
            permissions: vec!["app.access".into()],
            ..Default::default()
        };
        assert!(!session.is_email_verified());
        assert!(!session.can_access_app());
    }

    #[test]
    fn deserialize_playwright_persisted_session() {
        let raw = r#"{
            "access_token":"jwt-test",
            "refresh_token":null,
            "user_id":"230",
            "email":"admin@geosyntra.com",
            "name":"GeoSyntra Admin",
            "role":"Owner",
            "role_slug":"owner",
            "status":"Active",
            "tenant_id":"geosyntra-default",
            "permissions":["app.access","aoi.read","admin.panel"]
        }"#;
        let session: AuthSession = serde_json::from_str(raw).unwrap();
        assert!(session.is_signed_in());
        assert!(session.has_permission("app.access"));
        assert!(session.has_permission("aoi.read"));
    }
}
