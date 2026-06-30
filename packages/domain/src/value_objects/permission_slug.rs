use std::{
    ops::Deref,
    str::FromStr,
};

use crate::{error::DomainResult, Action, DomainError, Resource, SharedStr};

/// GeoSyntra permission slug (e.g. `admin.users.read`, `aoi.write`).
///
/// Maps dotted Express slugs to domain [`Resource`] + [`Action`]. Most slugs use the
/// last segment as action and join prior segments with `_` for the resource. Slugs
/// listed in [`SLUG_ALIASES`] override mechanical splitting.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PermissionSlug(SharedStr);

/// Explicit slug → (resource, action) overrides (Express slugs that cannot split mechanically).
pub const SLUG_ALIASES: &[(&str, &str, &str)] = &[
    // Resource `ai` is below Resource VO minimum length (3).
    ("ai.run", "ai_chat", "run"),
    // Panel is a capability gate, not an RBAC action verb.
    ("admin.panel", "admin_panel", "access"),
];

/// Every slug from Express [`permissions.js`](Geosyntra/backend/server/rbac/permissions.js).
pub const EXPRESS_PERMISSION_SLUGS: &[&str] = &[
    "app.access",
    "admin.panel",
    "admin.users.read",
    "admin.users.manage",
    "admin.users.approve",
    "admin.users.suspend",
    "admin.roles.assign",
    "admin.invites.create",
    "admin.audit.read",
    "admin.settings.manage",
    "admin.tokens.read",
    "admin.tokens.manage",
    "aoi.read",
    "aoi.write",
    "analytics.run",
    "reports.write",
    "ai.run",
];

impl PermissionSlug {
    pub fn new(slug: &str) -> DomainResult<Self> {
        let slug = slug.trim().to_lowercase();
        if slug.is_empty() {
            return Err(DomainError::ValidationError(
                "Permission slug cannot be empty".into(),
            ));
        }
        if !slug
            .split('.')
            .all(|part| {
                !part.is_empty()
                    && part
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            })
        {
            return Err(DomainError::ValidationError(
                "Invalid permission slug format".into(),
            ));
        }
        Ok(Self(slug.into()))
    }

    pub fn slug(&self) -> &str {
        &self.0
    }

    pub fn to_resource_action(&self) -> DomainResult<(Resource, Action)> {
        if let Some((resource, action)) = lookup_alias(self.slug()) {
            return Ok((Resource::new(resource)?, Action::new(action)?));
        }

        let parts: Vec<&str> = self.0.split('.').collect();
        if parts.len() < 2 {
            return Err(DomainError::ValidationError(
                "Permission slug must contain at least one dot".into(),
            ));
        }
        let action = Action::new(parts.last().unwrap())?;
        let resource_str = parts[..parts.len() - 1].join("_");
        let resource = Resource::new(&resource_str)?;
        Ok((resource, action))
    }
}

fn lookup_alias(slug: &str) -> Option<(&str, &str)> {
    SLUG_ALIASES
        .iter()
        .find(|(s, _, _)| *s == slug)
        .map(|(_, r, a)| (*r, *a))
}

impl Deref for PermissionSlug {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl FromStr for PermissionSlug {
    type Err = DomainError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_admin_users_read() {
        let slug = PermissionSlug::new("admin.users.read").unwrap();
        let (resource, action) = slug.to_resource_action().unwrap();
        assert_eq!(resource.resource(), "admin_users");
        assert_eq!(action.action(), "read");
    }

    #[test]
    fn maps_aoi_write() {
        let slug = PermissionSlug::new("aoi.write").unwrap();
        let (resource, action) = slug.to_resource_action().unwrap();
        assert_eq!(resource.resource(), "aoi");
        assert_eq!(action.action(), "write");
    }

    #[test]
    fn aliases_admin_panel_and_ai_run() {
        let panel = PermissionSlug::new("admin.panel").unwrap();
        let (r, a) = panel.to_resource_action().unwrap();
        assert_eq!(r.resource(), "admin_panel");
        assert_eq!(a.action(), "access");

        let ai = PermissionSlug::new("ai.run").unwrap();
        let (r, a) = ai.to_resource_action().unwrap();
        assert_eq!(r.resource(), "ai_chat");
        assert_eq!(a.action(), "run");
    }

    #[test]
    fn rejects_empty_slug_and_single_segment_mapping() {
        assert!(PermissionSlug::new("").is_err());
        assert!(PermissionSlug::new("read").unwrap().to_resource_action().is_err());
    }
}
