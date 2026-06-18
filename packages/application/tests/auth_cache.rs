//! AuthCache port behavior (Task 23.6).

use std::sync::Arc;
use std::time::Duration;

use application::ports::{AuthCache, CachedTenantPolicies, NoopAuthCache};

struct RecordingAuthCache {
    inner: NoopAuthCache,
    invalidations: Arc<std::sync::Mutex<Vec<String>>>,
}

#[async_trait::async_trait]
impl AuthCache for RecordingAuthCache {
    async fn get_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
    ) -> Option<Vec<String>> {
        self.inner
            .get_membership_role_ids(user_id, tenant_id)
            .await
    }

    async fn set_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
        role_ids: &[String],
        ttl: Duration,
    ) {
        self.inner
            .set_membership_role_ids(user_id, tenant_id, role_ids, ttl)
            .await;
    }

    async fn get_role_permission_slugs(&self, role_id: &str) -> Option<Vec<String>> {
        self.inner.get_role_permission_slugs(role_id).await
    }

    async fn set_role_permission_slugs(
        &self,
        role_id: &str,
        slugs: &[String],
        ttl: Duration,
    ) {
        self.inner
            .set_role_permission_slugs(role_id, slugs, ttl)
            .await;
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

    async fn invalidate_user(&self, user_id: &str) {
        self.invalidations
            .lock()
            .unwrap()
            .push(format!("user:{user_id}"));
        self.inner.invalidate_user(user_id).await;
    }

    async fn invalidate_tenant(&self, tenant_id: &str) {
        self.invalidations
            .lock()
            .unwrap()
            .push(format!("tenant:{tenant_id}"));
        self.inner.invalidate_tenant(tenant_id).await;
    }
}

#[tokio::test]
async fn noop_cache_always_misses() {
    let cache = NoopAuthCache;
    assert!(
        cache
            .get_membership_role_ids("u1", "t1")
            .await
            .is_none()
    );
    assert!(cache.get_role_permission_slugs("t1:owner").await.is_none());
    assert!(cache.get_tenant_policies("t1").await.is_none());
}

#[tokio::test]
async fn recording_cache_tracks_invalidations() {
    let log = Arc::new(std::sync::Mutex::new(Vec::new()));
    let cache = Arc::new(RecordingAuthCache {
        inner: NoopAuthCache,
        invalidations: log.clone(),
    }) as Arc<dyn AuthCache>;

    cache.invalidate_user("u42").await;
    cache.invalidate_tenant("default").await;

    let events = log.lock().unwrap().clone();
    assert_eq!(events, vec!["user:u42".to_string(), "tenant:default".to_string()]);
}
