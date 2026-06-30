pub mod abac_seed;
pub mod matrix;
pub mod matrix_seed;
pub mod platform_tenant;
pub mod role_builder;
pub mod role_loader;
pub mod role_slug;

pub use abac_seed::seed_default_abac_policy;
pub use matrix_seed::{seed_default_tenant_matrix, seed_rbac_matrix, DEFAULT_TENANT_ID};
pub use platform_tenant::ensure_platform_tenant;
pub use role_builder::role_from_slug;
pub use role_loader::{load_role_by_slug, permissions_from_slugs, try_load_role_by_slug};
pub use role_slug::{
    display_role_to_slug, normalize_rbac_role, rbac_role_to_display, role_rank,
};
