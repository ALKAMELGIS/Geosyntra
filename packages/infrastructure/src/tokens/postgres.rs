use std::sync::Arc;

use application::ports::{
    SystemTokenStatus, TokenVault, UserTokenStatus,
};
use application::error::{AppError, AppResult};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};

use super::{registry, vault};

#[derive(Clone)]
pub struct PostgresTokenVault {
    pool: Arc<PgPool>,
}

impl PostgresTokenVault {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }

    async fn db_value(&self, name: &str) -> AppResult<Option<String>> {
        let row = sqlx::query("SELECT value_envelope, active FROM system_tokens WHERE name = $1")
            .bind(name)
            .fetch_optional(self.pool.as_ref())
            .await
            .map_err(crate::error::map_sqlx)?;
        let Some(row) = row else {
            return Ok(None);
        };
        let active: bool = row.get("active");
        if !active {
            return Ok(None);
        }
        let envelope: String = row.get("value_envelope");
        Ok(vault::decrypt_value(&envelope))
    }

    fn source_for(name: &str, env_hit: bool, db_hit: bool) -> &'static str {
        if env_hit {
            "environment"
        } else if db_hit {
            "database"
        } else {
            "none"
        }
    }

    async fn row_to_status(
        &self,
        name: &str,
        label: &str,
        category: &str,
        env_only: bool,
        envelope: &str,
        active: bool,
        expires_at: Option<String>,
        last_tested_at: Option<String>,
        last_test_ok: Option<bool>,
        last_test_message: Option<String>,
        updated_at: Option<String>,
        updated_by: Option<String>,
    ) -> SystemTokenStatus {
        let env_hit = registry::env_configured(name);
        let db_val = vault::decrypt_value(envelope);
        let db_hit = db_val.is_some();
        let configured = env_hit || db_hit;
        let masked = registry::env_value(registry::registry_entry(name).map(|e| e.env_keys).unwrap_or(&[]))
            .map(|v| registry::mask_value(&v))
            .filter(|m| !m.is_empty())
            .or_else(|| db_val.as_deref().map(registry::mask_value))
            .unwrap_or_default();
        SystemTokenStatus {
            name: name.to_string(),
            label: label.to_string(),
            category: category.to_string(),
            configured,
            active,
            masked,
            env_only,
            source: Self::source_for(name, env_hit, db_hit).to_string(),
            expires_at,
            last_tested_at,
            last_test_ok,
            last_test_message,
            updated_at,
            updated_by,
            encrypted: vault::encrypted_at_rest(),
        }
    }
}

#[async_trait]
impl TokenVault for PostgresTokenVault {
    fn ready(&self) -> bool {
        true
    }

    fn encrypted_at_rest(&self) -> bool {
        vault::encrypted_at_rest()
    }

    async fn sync_environment(&self) -> AppResult<u32> {
        let mut synced = 0_u32;
        for entry in registry::TOKEN_REGISTRY {
            if entry.env_only {
                continue;
            }
            let Some(from_env) = registry::env_value(entry.env_keys) else {
                continue;
            };
            let existing = self.db_value(entry.name).await?;
            if existing.is_some() {
                continue;
            }
            self.upsert_system(
                entry.name,
                &from_env,
                Some(entry.label),
                Some(entry.category),
                true,
                Some("system@env-sync"),
            )
            .await?;
            sqlx::query(
                "INSERT INTO system_token_audit (token_name, action, actor_email, detail, created_at)
                 VALUES ($1, $2, $3, $4, NOW())",
            )
            .bind(entry.name)
            .bind("env_bootstrap")
            .bind("system@env-sync")
            .bind("seeded from environment")
            .execute(self.pool.as_ref())
            .await
            .map_err(crate::error::map_sqlx)?;
            synced += 1;
        }
        Ok(synced)
    }

    async fn is_configured(&self, name: &str) -> AppResult<bool> {
        if registry::env_configured(name) {
            return Ok(true);
        }
        if registry::registry_entry(name).is_some_and(|e| e.env_only) {
            return Ok(false);
        }
        Ok(self.db_value(name).await?.is_some())
    }

    async fn resolve(&self, name: &str) -> AppResult<Option<String>> {
        if let Some(entry) = registry::registry_entry(name) {
            if let Some(v) = registry::env_value(entry.env_keys) {
                return Ok(Some(v));
            }
            if entry.env_only {
                return Ok(None);
            }
        }
        self.db_value(name).await
    }

    async fn list_system_status(&self) -> AppResult<Vec<SystemTokenStatus>> {
        let rows = sqlx::query(
            "SELECT name, label, category, value_envelope, active, expires_at, last_tested_at,
                    last_test_ok, last_test_message, updated_at::text, updated_by
             FROM system_tokens ORDER BY name ASC",
        )
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;

        let mut by_name: std::collections::BTreeMap<String, SystemTokenStatus> =
            std::collections::BTreeMap::new();
        for row in rows {
            let name: String = row.get("name");
            let label: String = row.get("label");
            let category: String = row.get("category");
            let envelope: String = row.get("value_envelope");
            let active: bool = row.get("active");
            let expires_at: Option<String> = row.get("expires_at");
            let last_tested_at: Option<String> = row.get("last_tested_at");
            let last_test_ok: Option<bool> = row.get("last_test_ok");
            let last_test_message: Option<String> = row.get("last_test_message");
            let updated_at: Option<String> = row.get("updated_at");
            let updated_by: Option<String> = row.get("updated_by");
            let env_only = registry::registry_entry(&name).is_some_and(|e| e.env_only);
            by_name.insert(
                name.clone(),
                self.row_to_status(
                    &name,
                    &label,
                    &category,
                    env_only,
                    &envelope,
                    active,
                    expires_at,
                    last_tested_at,
                    last_test_ok,
                    last_test_message,
                    updated_at,
                    updated_by,
                )
                .await,
            );
        }

        let mut out: Vec<SystemTokenStatus> = registry::TOKEN_REGISTRY
            .iter()
            .map(|entry| {
                if let Some(existing) = by_name.remove(entry.name) {
                    return existing;
                }
                SystemTokenStatus {
                    name: entry.name.to_string(),
                    label: entry.label.to_string(),
                    category: entry.category.to_string(),
                    configured: registry::env_configured(entry.name),
                    active: registry::env_configured(entry.name),
                    masked: registry::env_value(entry.env_keys)
                        .map(|v| registry::mask_value(&v))
                        .unwrap_or_default(),
                    env_only: entry.env_only,
                    source: if registry::env_configured(entry.name) {
                        "environment".into()
                    } else {
                        "none".into()
                    },
                    expires_at: None,
                    last_tested_at: None,
                    last_test_ok: None,
                    last_test_message: None,
                    updated_at: None,
                    updated_by: None,
                    encrypted: vault::encrypted_at_rest(),
                }
            })
            .collect();
        out.extend(by_name.into_values());
        Ok(out)
    }

    async fn upsert_system(
        &self,
        name: &str,
        value: &str,
        label: Option<&str>,
        category: Option<&str>,
        active: bool,
        updated_by: Option<&str>,
    ) -> AppResult<SystemTokenStatus> {
        let name = name.trim().to_lowercase();
        let entry = registry::registry_entry(&name).ok_or_else(|| {
            AppError::ValidationError(format!("unknown token: {name}"))
        })?;
        if entry.env_only {
            return Err(AppError::ValidationError("mapbox_env_only".into()));
        }
        let value = value.trim();
        if value.is_empty() {
            return Err(AppError::ValidationError("value_required".into()));
        }
        let now = Utc::now();
        let envelope = vault::encrypt_value(value);
        let label = label.unwrap_or(entry.label);
        let category = category.unwrap_or(entry.category);
        sqlx::query(
            "INSERT INTO system_tokens (name, label, category, value_envelope, active, updated_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
             ON CONFLICT (name) DO UPDATE SET
               label = EXCLUDED.label,
               category = EXCLUDED.category,
               value_envelope = EXCLUDED.value_envelope,
               active = EXCLUDED.active,
               updated_by = EXCLUDED.updated_by,
               updated_at = EXCLUDED.updated_at",
        )
        .bind(&name)
        .bind(label)
        .bind(category)
        .bind(&envelope)
        .bind(active)
        .bind(updated_by)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;

        self.row_to_status(
            &name,
            label,
            category,
            entry.env_only,
            &envelope,
            active,
            None,
            None,
            None,
            None,
            Some(now.to_rfc3339()),
            updated_by.map(str::to_string),
        )
        .await
        .pipe(Ok)
    }

    async fn patch_system(
        &self,
        name: &str,
        value: Option<&str>,
        active: Option<bool>,
        updated_by: Option<&str>,
    ) -> AppResult<SystemTokenStatus> {
        let name = name.trim().to_lowercase();
        let entry = registry::registry_entry(&name).ok_or_else(|| {
            AppError::ValidationError(format!("unknown token: {name}"))
        })?;
        if entry.env_only {
            return Err(AppError::ValidationError("mapbox_env_only".into()));
        }
        let row = sqlx::query(
            "SELECT label, category, value_envelope, active, expires_at, last_tested_at,
                    last_test_ok, last_test_message, updated_at::text, updated_by
             FROM system_tokens WHERE name = $1",
        )
        .bind(&name)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;
        let Some(row) = row else {
            return Err(AppError::ValidationError(format!("unknown token: {name}")));
        };
        let mut envelope: String = row.get("value_envelope");
        let mut active_val: bool = row.get("active");
        if let Some(v) = value {
            let v = v.trim();
            if v.is_empty() {
                return Err(AppError::ValidationError("value_required".into()));
            }
            envelope = vault::encrypt_value(v);
        }
        if let Some(a) = active {
            active_val = a;
        }
        let now = Utc::now();
        sqlx::query(
            "UPDATE system_tokens SET value_envelope = $2, active = $3, updated_by = $4, updated_at = $5 WHERE name = $1",
        )
        .bind(&name)
        .bind(&envelope)
        .bind(active_val)
        .bind(updated_by)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;

        self.row_to_status(
            &name,
            row.get("label"),
            row.get("category"),
            entry.env_only,
            &envelope,
            active_val,
            row.get("expires_at"),
            row.get("last_tested_at"),
            row.get("last_test_ok"),
            row.get("last_test_message"),
            Some(now.to_rfc3339()),
            updated_by.map(str::to_string),
        )
        .await
        .pipe(Ok)
    }

    async fn record_system_test(
        &self,
        name: &str,
        ok: bool,
        message: Option<&str>,
    ) -> AppResult<()> {
        let name = name.trim().to_lowercase();
        let now = Utc::now();
        sqlx::query(
            "UPDATE system_tokens SET last_tested_at = $2, last_test_ok = $3, last_test_message = $4, updated_at = $2 WHERE name = $1",
        )
        .bind(&name)
        .bind(now)
        .bind(ok)
        .bind(message)
        .execute(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;
        Ok(())
    }

    async fn list_user_tokens(&self, user_id: &str) -> AppResult<Vec<UserTokenStatus>> {
        let uid: i64 = user_id.parse().map_err(|_| AppError::ValidationError("invalid user id".into()))?;
        let rows = sqlx::query(
            "SELECT provider, value_envelope, is_active FROM user_api_tokens WHERE user_id = $1 ORDER BY provider ASC",
        )
        .bind(uid)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;
        Ok(rows
            .into_iter()
            .map(|row| {
                let provider: String = row.get("provider");
                let envelope: String = row.get("value_envelope");
                let active: bool = row.get("is_active");
                let value = vault::decrypt_value(&envelope);
                UserTokenStatus {
                    provider: provider.clone(),
                    configured: value.is_some(),
                    active,
                    masked: value
                        .as_deref()
                        .map(registry::mask_value)
                        .unwrap_or_default(),
                }
            })
            .collect())
    }

    async fn upsert_user_token(
        &self,
        user_id: &str,
        email: &str,
        provider: &str,
        value: &str,
    ) -> AppResult<UserTokenStatus> {
        let uid: i64 = user_id.parse().map_err(|_| AppError::ValidationError("invalid user id".into()))?;
        let provider = provider.trim().to_lowercase();
        if registry::registry_entry(&provider).is_some_and(|e| e.env_only) {
            return Err(AppError::ValidationError("mapbox_env_only".into()));
        }
        let value = value.trim();
        if value.is_empty() {
            return Err(AppError::ValidationError("value_required".into()));
        }
        let envelope = vault::encrypt_value(value);
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO user_api_tokens (user_id, user_email, provider, value_envelope, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, TRUE, $5, $5)
             ON CONFLICT (user_id, provider) DO UPDATE SET
               user_email = EXCLUDED.user_email,
               value_envelope = EXCLUDED.value_envelope,
               is_active = TRUE,
               updated_at = EXCLUDED.updated_at",
        )
        .bind(uid)
        .bind(email)
        .bind(&provider)
        .bind(&envelope)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(crate::error::map_sqlx)?;
        Ok(UserTokenStatus {
            provider,
            configured: true,
            active: true,
            masked: registry::mask_value(value),
        })
    }

    async fn delete_user_token(&self, user_id: &str, provider: &str) -> AppResult<bool> {
        let uid: i64 = user_id.parse().map_err(|_| AppError::ValidationError("invalid user id".into()))?;
        let provider = provider.trim().to_lowercase();
        let result = sqlx::query("DELETE FROM user_api_tokens WHERE user_id = $1 AND provider = $2")
            .bind(uid)
            .bind(&provider)
            .execute(self.pool.as_ref())
            .await
            .map_err(crate::error::map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn capabilities_snapshot(&self) -> AppResult<Value> {
        let mut providers = serde_json::Map::new();
        for entry in registry::TOKEN_REGISTRY {
            let configured = self.is_configured(entry.name).await?;
            providers.insert(
                entry.name.into(),
                json!({
                    "label": entry.label,
                    "category": entry.category,
                    "configured": configured,
                    "active": configured,
                    "legacyBuiltin": null,
                    "source": if registry::env_configured(entry.name) { "environment" } else if configured { "database" } else { "none" },
                }),
            );
        }
        Ok(json!({
            "version": 1,
            "providers": providers,
            "gemini": self.is_configured("gemini").await?,
            "openai": self.is_configured("openai").await?,
            "claude": self.is_configured("claude").await?,
            "deepseek": self.is_configured("deepseek").await?,
            "mapbox": self.is_configured("mapbox").await?,
            "arcgis": self.is_configured("arcgis").await?,
            "sentinelhub": self.is_configured("sentinelhub").await? || self.is_configured("sentinelhub_wms").await?,
            "openrouteservice": self.is_configured("openrouteservice").await?,
            "graphhopper": self.is_configured("graphhopper").await?,
            "openweathermap": self.is_configured("openweathermap").await?,
        }))
    }
}

trait Pipe: Sized {
    fn pipe<F, R>(self, f: F) -> R
    where
        F: FnOnce(Self) -> R,
    {
        f(self)
    }
}

impl<T> Pipe for T {}
