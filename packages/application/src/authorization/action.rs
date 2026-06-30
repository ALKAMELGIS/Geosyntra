//! Application-layer action identifier for the authorization engine.
//!
//! **Not** the same as domain [`domain::Action`] (RBAC verb on a resource). Policies and
//! `UseCaseDescriptor::ACTION` use `AuthorizationAction` strings; permission checks on
//! `SubjectContext` use domain `Resource` + `Action` (or [`domain::PermissionSlug`] at the boundary).
//! See [`migration/billing-rbac-bridge.md`](../../../migration/billing-rbac-bridge.md).

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct AuthorizationAction(String);

impl AuthorizationAction {
    pub fn new(id: &str) -> Self {
        Self(id.to_string())
    }
    pub fn action(&self) -> &str {
        &self.0
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for AuthorizationAction {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::fmt::Display for AuthorizationAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
