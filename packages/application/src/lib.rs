//! Application layer — use cases, ports, authorization, projection.
//!
//! Re-exports [`domain`] so handlers can depend on a single crate during migration.
//!
//! ```
//! use application::domain::Email;
//!
//! let email = Email::new("app@geosyntra.test").unwrap();
//! assert_eq!(email.email(), "app@geosyntra.test");
//! ```

#![allow(dead_code)]
#![allow(clippy::new_without_default)]
#![allow(clippy::large_enum_variant)]
#![allow(clippy::new_ret_no_self)]

pub use domain;

pub mod authorization;
pub mod command_appliers;
pub mod dto;
pub mod error;
pub mod platform_config;
pub mod ports;
pub mod projection;
pub mod rbac;
pub mod subject_context;
pub mod usecases;

pub use dto::MembershipView;
pub use subject_context::SubjectContext;

#[cfg(test)]
mod tests {
    use super::domain::{TenantId, UserId};
    use super::MembershipView;

    #[test]
    fn reexports_domain_types() {
        assert_eq!(UserId::new("u1").as_str(), "u1");
        assert_eq!(TenantId::new("t1").as_str(), "t1");
    }

    #[test]
    fn membership_view_supports_partial_sql_load() {
        let view = MembershipView {
            user_id: Some(UserId::new("u1")),
            tenant_id: Some(TenantId::new("t1")),
            roles: None,
            created_at: None,
            version: Some(3),
        };
        assert_eq!(view.user_id.as_ref().unwrap().as_str(), "u1");
        assert_eq!(view.tenant_id.as_ref().unwrap().as_str(), "t1");
        assert_eq!(view.version, Some(3));
    }
}
