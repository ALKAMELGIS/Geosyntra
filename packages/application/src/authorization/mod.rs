pub mod allow_all;
pub mod access_descriptor;
pub mod action;
pub mod attributes;
pub mod authorize;
pub mod classifiers;
pub mod engine;
pub mod field_access;
pub mod guard;
pub mod policys;
pub mod ports;
pub mod relation;
pub mod resource_tenant;
pub mod resource_type;

pub use authorize::{
    authorize_use_case, authorize_use_case_with_fields, neutral_environment, AuthorizationParams,
};
pub use resource_tenant::resolve_resource_tenant;
pub use engine::AuthorizationEngine;
pub use field_access::FieldAccessResolver;
pub use policys::rbac_mapping::map_use_case_to_domain;
pub use policys::rbac_permission::RbacPermissionPolicy;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessDecision {
    Allow,
    Deny,
}
