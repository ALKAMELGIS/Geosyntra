use async_trait::async_trait;
use serde_json::Value;

use crate::error::AppResult;

#[derive(Debug, Clone)]
pub struct SystemTokenStatus {
    pub name: String,
    pub label: String,
    pub category: String,
    pub configured: bool,
    pub active: bool,
    pub masked: String,
    pub env_only: bool,
    pub source: String,
    pub expires_at: Option<String>,
    pub last_tested_at: Option<String>,
    pub last_test_ok: Option<bool>,
    pub last_test_message: Option<String>,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>,
    pub encrypted: bool,
}

#[derive(Debug, Clone)]
pub struct UserTokenStatus {
    pub provider: String,
    pub configured: bool,
    pub active: bool,
    pub masked: String,
}

#[async_trait]
pub trait TokenVault: Send + Sync {
    fn ready(&self) -> bool;
    fn encrypted_at_rest(&self) -> bool;
    async fn sync_environment(&self) -> AppResult<u32>;
    async fn is_configured(&self, name: &str) -> AppResult<bool>;
    async fn resolve(&self, name: &str) -> AppResult<Option<String>>;
    async fn list_system_status(&self) -> AppResult<Vec<SystemTokenStatus>>;
    async fn upsert_system(
        &self,
        name: &str,
        value: &str,
        label: Option<&str>,
        category: Option<&str>,
        active: bool,
        updated_by: Option<&str>,
    ) -> AppResult<SystemTokenStatus>;
    async fn patch_system(
        &self,
        name: &str,
        value: Option<&str>,
        active: Option<bool>,
        updated_by: Option<&str>,
    ) -> AppResult<SystemTokenStatus>;
    async fn record_system_test(
        &self,
        name: &str,
        ok: bool,
        message: Option<&str>,
    ) -> AppResult<()>;
    async fn list_user_tokens(&self, user_id: &str) -> AppResult<Vec<UserTokenStatus>>;
    async fn upsert_user_token(
        &self,
        user_id: &str,
        email: &str,
        provider: &str,
        value: &str,
    ) -> AppResult<UserTokenStatus>;
    async fn delete_user_token(&self, user_id: &str, provider: &str) -> AppResult<bool>;
    async fn capabilities_snapshot(&self) -> AppResult<Value>;
}
