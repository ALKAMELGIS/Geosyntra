//! Infrastructure layer — sqlx PostgreSQL repositories and external adapters (Tasks 9–11).

pub mod auth;
pub mod authz;
pub mod billing;
pub mod cache;
pub mod crypto;
pub mod error;
pub mod postgres;
pub mod tokens;

pub use auth::{JwtSubjectContextResolver, ReloadableAuthorizationService};
pub use cache::build_auth_cache_from_env;
pub use authz::{
    display_role_to_slug, load_role_by_slug, normalize_rbac_role, rbac_role_to_display,
    role_from_slug, seed_default_tenant_matrix, seed_rbac_matrix, DEFAULT_TENANT_ID,
};
pub use billing::ExpressBillingPlanCatalog;
pub use crypto::{verify, BcryptPasswordHasher, JwtTokenIssuer};
pub use error::{map_migrate, map_sqlx};
pub use postgres::{
    bootstrap, connect, ensure_system_owners, next_user_id, run_migrations,
    PostgresAuditRepository,
    PostgresAuthDirectoryRepository, PostgresInviteRepository, PostgresInvitedUserCreator,
    PostgresMembershipRepository, PostgresPlatformConfigRepository, PostgresPolicyRepository, PostgresRefreshTokenRepository,
    PostgresRoleRepository,     PostgresSubscriptionRepository, PostgresTenantRepository, PostgresUserIdAllocator,
    PostgresUserRepository,
};
pub use tokens::PostgresTokenVault;
