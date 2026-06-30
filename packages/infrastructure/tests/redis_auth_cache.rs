//! Redis auth cache integration (Task 23.6). Skipped when REDIS_URL is unset.

use std::sync::Arc;
use std::time::Duration;

use application::ports::{AuthCache, CachedTenantPolicies};
use infrastructure::cache::RedisAuthCache;

#[tokio::test]
async fn redis_membership_and_policy_roundtrip() {
    let url = match std::env::var("REDIS_URL") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => {
            eprintln!("skip redis_membership_and_policy_roundtrip: REDIS_URL unset");
            return;
        }
    };

    let cache = match tokio::time::timeout(
        Duration::from_secs(2),
        RedisAuthCache::connect(&url),
    )
    .await
    {
        Ok(Ok(cache)) => Arc::new(cache) as Arc<dyn AuthCache>,
        _ => {
            eprintln!("skip redis_membership_and_policy_roundtrip: redis unreachable");
            return;
        }
    };

    let user = format!("test-user-{}", uuid::Uuid::new_v4());
    let tenant = "default";

    cache
        .set_membership_role_ids(
            &user,
            tenant,
            &["default:owner".to_string()],
            Duration::from_secs(60),
        )
        .await;

    let roles = cache
        .get_membership_role_ids(&user, tenant)
        .await
        .expect("membership cache hit");
    assert_eq!(roles, vec!["default:owner".to_string()]);

    cache
        .set_role_permission_slugs(
            "default:owner",
            &["admin.users.read".to_string()],
            Duration::from_secs(60),
        )
        .await;
    let slugs = cache
        .get_role_permission_slugs("default:owner")
        .await
        .expect("role cache hit");
    assert_eq!(slugs, vec!["admin.users.read".to_string()]);

    let policies = CachedTenantPolicies {
        fingerprint: "0:".to_string(),
        policies: vec![],
    };
    cache
        .set_tenant_policies(tenant, &policies, Duration::from_secs(60))
        .await;
    let cached = cache
        .get_tenant_policies(tenant)
        .await
        .expect("policy cache hit");
    assert_eq!(cached.fingerprint, "0:");

    cache.invalidate_user(&user).await;
    assert!(cache.get_membership_role_ids(&user, tenant).await.is_none());
}
