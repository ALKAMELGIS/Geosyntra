use std::time::Duration;

use application::{
    error::{AppError, AppResult},
    ports::{AuthCache, CachedTenantPolicies},
};
use async_trait::async_trait;
use redis::{aio::ConnectionManager, AsyncCommands};

use super::policy_codec::{decode_tenant_policies, encode_tenant_policies};

const MEMBERSHIP_PREFIX: &str = "gs:membership:";
const ROLE_PREFIX: &str = "gs:role:";
const POLICY_PREFIX: &str = "gs:policies:active:";

pub struct RedisAuthCache {
    conn: ConnectionManager,
}

impl RedisAuthCache {
    pub async fn connect_from_env() -> AppResult<Self> {
        let url = std::env::var("REDIS_URL")
            .map_err(|_| AppError::Repository("REDIS_URL not set".into()))?;
        Self::connect(&url).await
    }

    pub async fn connect(url: &str) -> AppResult<Self> {
        let client = redis::Client::open(url)
            .map_err(|e| AppError::Repository(format!("redis_client: {e}")))?;
        let conn = ConnectionManager::new(client)
            .await
            .map_err(|e| AppError::Repository(format!("redis_connect: {e}")))?;
        Ok(Self { conn })
    }

    fn membership_key(user_id: &str, tenant_id: &str) -> String {
        format!("{MEMBERSHIP_PREFIX}{user_id}:{tenant_id}")
    }

    fn role_key(role_id: &str) -> String {
        format!("{ROLE_PREFIX}{role_id}")
    }

    fn policy_key(tenant_id: &str) -> String {
        format!("{POLICY_PREFIX}{tenant_id}")
    }

    async fn delete_by_pattern(&self, pattern: &str) -> AppResult<()> {
        let mut conn = self.conn.clone();
        let mut cursor: u64 = 0;
        loop {
            let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(pattern)
                .arg("COUNT")
                .arg(100)
                .query_async(&mut conn)
                .await
                .map_err(|e| AppError::Repository(format!("redis_scan: {e}")))?;
            if !keys.is_empty() {
                let _: () = conn
                    .del(keys)
                    .await
                    .map_err(|e| AppError::Repository(format!("redis_del: {e}")))?;
            }
            cursor = next;
            if cursor == 0 {
                break;
            }
        }
        Ok(())
    }
}

#[async_trait]
impl AuthCache for RedisAuthCache {
    async fn get_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
    ) -> Option<Vec<String>> {
        let mut conn = self.conn.clone();
        let key = Self::membership_key(user_id, tenant_id);
        let raw: Option<String> = conn.get(&key).await.ok()?;
        raw.and_then(|json| serde_json::from_str(&json).ok())
    }

    async fn set_membership_role_ids(
        &self,
        user_id: &str,
        tenant_id: &str,
        role_ids: &[String],
        ttl: Duration,
    ) {
        let Ok(json) = serde_json::to_string(role_ids) else {
            return;
        };
        let mut conn = self.conn.clone();
        let key = Self::membership_key(user_id, tenant_id);
        let _: Result<(), _> = conn.set_ex(key, json, ttl.as_secs()).await;
    }

    async fn get_role_permission_slugs(&self, role_id: &str) -> Option<Vec<String>> {
        let mut conn = self.conn.clone();
        let key = Self::role_key(role_id);
        let raw: Option<String> = conn.get(&key).await.ok()?;
        raw.and_then(|json| serde_json::from_str(&json).ok())
    }

    async fn set_role_permission_slugs(
        &self,
        role_id: &str,
        slugs: &[String],
        ttl: Duration,
    ) {
        let Ok(json) = serde_json::to_string(slugs) else {
            return;
        };
        let mut conn = self.conn.clone();
        let key = Self::role_key(role_id);
        let _: Result<(), _> = conn.set_ex(key, json, ttl.as_secs()).await;
    }

    async fn get_tenant_policies(&self, tenant_id: &str) -> Option<CachedTenantPolicies> {
        let mut conn = self.conn.clone();
        let key = Self::policy_key(tenant_id);
        let raw: Option<String> = conn.get(&key).await.ok()?;
        raw.and_then(|json| decode_tenant_policies(&json).ok())
    }

    async fn set_tenant_policies(
        &self,
        tenant_id: &str,
        data: &CachedTenantPolicies,
        ttl: Duration,
    ) {
        let Ok(json) = encode_tenant_policies(&data.fingerprint, &data.policies) else {
            return;
        };
        let mut conn = self.conn.clone();
        let key = Self::policy_key(tenant_id);
        let _: Result<(), _> = conn.set_ex(key, json, ttl.as_secs()).await;
    }

    async fn invalidate_user(&self, user_id: &str) {
        let pattern = format!("{MEMBERSHIP_PREFIX}{user_id}:*");
        let _ = self.delete_by_pattern(&pattern).await;
    }

    async fn invalidate_tenant(&self, tenant_id: &str) {
        let mut conn = self.conn.clone();
        let policy_key = Self::policy_key(tenant_id);
        let role_pattern = format!("{ROLE_PREFIX}{tenant_id}:*");
        let membership_pattern = format!("{MEMBERSHIP_PREFIX}*:{tenant_id}");
        let _: Result<(), _> = conn.del(policy_key).await;
        let _ = self.delete_by_pattern(&role_pattern).await;
        let _ = self.delete_by_pattern(&membership_pattern).await;
    }
}
