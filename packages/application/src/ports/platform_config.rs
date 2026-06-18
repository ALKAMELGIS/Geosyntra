use async_trait::async_trait;
use serde_json::Value;

use crate::error::AppResult;

#[async_trait]
pub trait PlatformConfigRepository: Send + Sync {
    async fn get_settings(&self) -> AppResult<Value>;
    async fn merge_settings(&self, patch: &Value) -> AppResult<Value>;
}
