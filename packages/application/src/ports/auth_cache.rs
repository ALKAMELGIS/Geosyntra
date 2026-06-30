use std::time::Duration;

use async_trait::async_trait;

use crate::authorization::policys::ApplicationStoredPolicy;

/// Cached active ABAC policies for a tenant (Task 23.6).
#[derive(Debug, Clone)]
pub struct CachedTenantPolicies {
    pub fingerprint: String,
    pub policies: Vec<ApplicationStoredPolicy>,
}

/// Redis-backed cache for auth hot path — membership, roles, tenant policies.
#[async_trait]
pub trait AuthCache: Send + Sync {
    async fn get_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
    ) -> Option<Vec<String>>;

    async fn set_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
        role_ids: &[String],
        ttl: Duration,
    );

    async fn get_role_permission_slugs(&self, role_id: &str) -> Option<Vec<String>>;

    async fn set_role_permission_slugs(
        &self,
        role_id: &str,
        slugs: &[String],
        ttl: Duration,
    );

    async fn get_tenant_policies(&self, tenant_id: &str) -> Option<CachedTenantPolicies>;

    async fn set_tenant_policies(
        &self,
        tenant_id: &str,
        data: &CachedTenantPolicies,
        ttl: Duration,
    );

    async fn invalidate_user(&self, user_id: &str);

    async fn invalidate_tenant(&self, tenant_id: &str);
}

/// Postgres-only fallback when Redis is unavailable.
pub struct NoopAuthCache;

#[async_trait]
impl AuthCache for NoopAuthCache {
    async fn get_membership_role_ids(
        &self,
        _user_id: &str,
        _tenant_id: &str,
    ) -> Option<Vec<String>> {
        None
    }

    async fn set_membership_role_ids(
        &self,
        _user_id: &str,
        _tenant_id: &str,
        _role_ids: &[String],
        _ttl: Duration,
    ) {
    }

    async fn get_role_permission_slugs(&self, _role_id: &str) -> Option<Vec<String>> {
        None
    }

    async fn set_role_permission_slugs(
        &self,
        _role_id: &str,
        _slugs: &[String],
        _ttl: Duration,
    ) {
    }

    async fn get_tenant_policies(&self, _tenant_id: &str) -> Option<CachedTenantPolicies> {
        None
    }

    async fn set_tenant_policies(
        &self,
        _tenant_id: &str,
        _data: &CachedTenantPolicies,
        _ttl: Duration,
    ) {
    }

    async fn invalidate_user(&self, _user_id: &str) {}

    async fn invalidate_tenant(&self, _tenant_id: &str) {}
}
