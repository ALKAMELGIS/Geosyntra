use std::sync::Arc;

use application::{
    error::{AppError, AppResult},
    platform_config::{default_settings, ALLOWLISTED_KEYS},
    ports::PlatformConfigRepository,
};
use serde_json::Value;
use sqlx::PgPool;

use crate::error::map_sqlx;

const PLATFORM_SETTINGS_KEY: &str = "platform.settings";

pub struct PostgresPlatformConfigRepository {
    pool: Arc<PgPool>,
}

impl PostgresPlatformConfigRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl PlatformConfigRepository for PostgresPlatformConfigRepository {
    async fn get_settings(&self) -> AppResult<Value> {
        let row = sqlx::query_scalar::<_, String>(
            "SELECT value FROM platform_kv WHERE key = $1",
        )
        .bind(PLATFORM_SETTINGS_KEY)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let mut settings = default_settings();
        if let Some(raw) = row {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(obj) = parsed.as_object() {
                    if let Some(base) = settings.as_object_mut() {
                        for key in ALLOWLISTED_KEYS {
                            if let Some(v) = obj.get(*key) {
                                base.insert(key.to_string(), v.clone());
                            }
                        }
                    }
                }
            }
        }
        Ok(settings)
    }

    async fn merge_settings(&self, patch: &Value) -> AppResult<Value> {
        let current = self.get_settings().await?;
        let mut merged = current;
        if let (Some(base), Some(patch_obj)) = (merged.as_object_mut(), patch.as_object()) {
            for (key, value) in patch_obj {
                base.insert(key.clone(), value.clone());
            }
        } else {
            return Err(AppError::ValidationError(
                "invalid settings merge".into(),
            ));
        }
        let serialized = serde_json::to_string(&merged)
            .map_err(|e| AppError::ValidationError(e.to_string()))?;

        sqlx::query(
            r#"
            INSERT INTO platform_kv (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            "#,
        )
        .bind(PLATFORM_SETTINGS_KEY)
        .bind(serialized)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(merged)
    }
}
