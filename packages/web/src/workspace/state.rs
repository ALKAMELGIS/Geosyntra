use std::cell::RefCell;
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::auth_session::{AuthSession, DEFAULT_TENANT_ID};

pub const WORKSPACE_STATE_KEY: &str = "geosyntra_workspace_v1";
pub const TRIAL_DAYS: i64 = 21;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceLifecycle {
    None,
    Trialing,
    Active,
    Expired,
}

impl Default for WorkspaceLifecycle {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub email: String,
    pub tenant_id: String,
    pub lifecycle: WorkspaceLifecycle,
    pub workspace_ready: bool,
    pub trial_ends_at_ms: Option<i64>,
    pub updated_at_ms: i64,
}

impl WorkspaceState {
    pub fn storage_key(tenant_id: &str, email: &str) -> String {
        format!("{}:{}", normalize_email(email), tenant_id.trim())
    }
}

fn normalize_email(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

fn now_ms() -> i64 {
    crate::wall_clock::now_ms()
}

thread_local! {
    static MEMORY_STORE: RefCell<HashMap<String, WorkspaceState>> =
        RefCell::new(HashMap::new());
}

fn read_all() -> HashMap<String, WorkspaceState> {
    if let Some(from_disk) = load_persisted_all() {
        return from_disk;
    }
    MEMORY_STORE.with(|m| m.borrow().clone())
}

fn write_all(all: HashMap<String, WorkspaceState>) {
    MEMORY_STORE.with(|m| *m.borrow_mut() = all.clone());
    save_persisted_all(&all);
}

pub fn read_workspace_state(tenant_id: &str, email: &str) -> Option<WorkspaceState> {
    let key = WorkspaceState::storage_key(tenant_id, email);
    read_all().get(&key).cloned()
}

pub fn write_workspace_state(state: WorkspaceState) -> WorkspaceState {
    let key = WorkspaceState::storage_key(&state.tenant_id, &state.email);
    let mut all = read_all();
    let mut next = state;
    next.updated_at_ms = now_ms();
    all.insert(key, next.clone());
    write_all(all);
    next
}

pub fn trial_days_remaining(state: &WorkspaceState) -> Option<i64> {
    if state.lifecycle != WorkspaceLifecycle::Trialing {
        return None;
    }
    let ends = state.trial_ends_at_ms?;
    let day_ms = 86_400_000_i64;
    Some(((ends - now_ms()) as f64 / day_ms as f64).ceil().max(0.0) as i64)
}

pub fn sync_trial_expiry(tenant_id: &str, email: &str) -> Option<WorkspaceState> {
    let Some(mut state) = read_workspace_state(tenant_id, email) else {
        return None;
    };
    if state.lifecycle != WorkspaceLifecycle::Trialing {
        return Some(state);
    }
    let ends = state.trial_ends_at_ms?;
    if ends > now_ms() {
        return Some(state);
    }
    state.lifecycle = WorkspaceLifecycle::Expired;
    state.workspace_ready = false;
    Some(write_workspace_state(state))
}

pub fn is_trial_expired(state: &WorkspaceState) -> bool {
    if state.lifecycle == WorkspaceLifecycle::Expired {
        return true;
    }
    if state.lifecycle != WorkspaceLifecycle::Trialing {
        return false;
    }
    trial_days_remaining(state).is_some_and(|d| d <= 0)
}

pub fn requires_upgrade_to_paid(tenant_id: &str, email: &str) -> bool {
    sync_trial_expiry(tenant_id, email).is_some_and(|s| is_trial_expired(&s))
}

pub fn is_platform_owner(session: &AuthSession) -> bool {
    session.has_permission("admin.tokens.manage")
        || session
            .role_slug
            .as_deref()
            .is_some_and(|s| matches!(s.to_ascii_lowercase().as_str(), "owner" | "super_admin"))
}

pub fn activate_trial_workspace(session: &AuthSession) -> WorkspaceState {
    let email = session.email.clone().unwrap_or_default();
    let tenant_id = session.active_tenant().to_string();
    let ends = now_ms() + TRIAL_DAYS * 86_400_000;
    write_workspace_state(WorkspaceState {
        email,
        tenant_id,
        lifecycle: WorkspaceLifecycle::Trialing,
        workspace_ready: true,
        trial_ends_at_ms: Some(ends),
        updated_at_ms: now_ms(),
    })
}

pub fn activate_paid_workspace(session: &AuthSession) -> WorkspaceState {
    let email = session.email.clone().unwrap_or_default();
    let tenant_id = session.active_tenant().to_string();
    write_workspace_state(WorkspaceState {
        email,
        tenant_id,
        lifecycle: WorkspaceLifecycle::Active,
        workspace_ready: true,
        trial_ends_at_ms: None,
        updated_at_ms: now_ms(),
    })
}

pub fn ensure_platform_owner_workspace(session: &AuthSession) -> WorkspaceState {
    let email = session.email.clone().unwrap_or_default();
    let tenant_id = session.active_tenant().to_string();
    if let Some(existing) = read_workspace_state(&tenant_id, &email) {
        if existing.workspace_ready && existing.lifecycle != WorkspaceLifecycle::Expired {
            return existing;
        }
    }
    write_workspace_state(WorkspaceState {
        email,
        tenant_id,
        lifecycle: WorkspaceLifecycle::Active,
        workspace_ready: true,
        trial_ends_at_ms: None,
        updated_at_ms: now_ms(),
    })
}

fn load_persisted_all() -> Option<HashMap<String, WorkspaceState>> {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        return load_persisted_web();
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        None
    }
}

fn save_persisted_all(all: &HashMap<String, WorkspaceState>) {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        save_persisted_web(all);
    }
    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        let _ = all;
    }
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn load_persisted_web() -> Option<HashMap<String, WorkspaceState>> {
    let window = web_sys::window()?;
    let storage = window.local_storage().ok()??;
    let raw = storage.get_item(WORKSPACE_STATE_KEY).ok()??;
    serde_json::from_str(&raw).ok()
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn save_persisted_web(all: &HashMap<String, WorkspaceState>) {
    if let Ok(raw) = serde_json::to_string(all) {
        if let Some(window) = web_sys::window() {
            if let Ok(Some(storage)) = window.local_storage() {
                let _ = storage.set_item(WORKSPACE_STATE_KEY, &raw);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trial_expires_after_end_timestamp() {
        MEMORY_STORE.with(|m| m.borrow_mut().clear());
        let state = write_workspace_state(WorkspaceState {
            email: "u@test.com".into(),
            tenant_id: DEFAULT_TENANT_ID.into(),
            lifecycle: WorkspaceLifecycle::Trialing,
            workspace_ready: true,
            trial_ends_at_ms: Some(now_ms() - 1_000),
            updated_at_ms: 0,
        });
        assert!(is_trial_expired(&state));
    }

    #[test]
    fn owner_workspace_activation_is_idempotent() {
        MEMORY_STORE.with(|m| m.borrow_mut().clear());
        let session = AuthSession {
            email: Some("admin@geosyntra.com".into()),
            tenant_id: Some(DEFAULT_TENANT_ID.into()),
            ..Default::default()
        };
        let a = ensure_platform_owner_workspace(&session);
        let b = ensure_platform_owner_workspace(&session);
        assert_eq!(a.workspace_ready, b.workspace_ready);
        assert_eq!(a.lifecycle, WorkspaceLifecycle::Active);
    }
}
