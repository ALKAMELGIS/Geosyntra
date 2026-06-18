use serde::Deserialize;
use serde_json::Value;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize)]
pub struct PlatformConfigSnapshot {
    pub environment: Option<String>,
    #[serde(rename = "isProduction", default)]
    pub is_production: bool,
    pub capabilities: Value,
    pub gateway: Value,
    #[serde(default)]
    pub bindings: Value,
    #[serde(rename = "requiredMissing", default)]
    pub required_missing: Vec<Value>,
    #[serde(rename = "requiredPresent", default)]
    pub required_present: Vec<Value>,
    #[serde(default)]
    pub ok: bool,
}

pub async fn fetch_runtime(token: &str) -> Result<PlatformConfigSnapshot, ApiError> {
    let client = ApiClient::from_env();
    let runtime: serde_json::Value = client
        .get_json("/api/platform/runtime", Some(token))
        .await?;
    let config: serde_json::Value = client
        .get_json("/api/config/status", Some(token))
        .await?;
    let gateway: serde_json::Value = client
        .get_json("/api/gateway/status", Some(token))
        .await?;
    let env_health: serde_json::Value = client
        .get_json("/api/platform/env-health", Some(token))
        .await?;

    Ok(PlatformConfigSnapshot {
        environment: runtime
            .get("environment")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        is_production: runtime
            .get("isProduction")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        capabilities: config
            .get("capabilities")
            .cloned()
            .unwrap_or(serde_json::json!({})),
        gateway: gateway.get("gateway").cloned().unwrap_or(gateway),
        bindings: env_health
            .get("bindings")
            .cloned()
            .unwrap_or(serde_json::json!([])),
        required_missing: env_health
            .get("requiredMissing")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        required_present: env_health
            .get("requiredPresent")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        ok: env_health.get("ok").and_then(|v| v.as_bool()).unwrap_or(true),
    })
}

#[derive(Debug, Deserialize)]
pub struct PlatformSettingsResponse {
    pub settings: Value,
    #[serde(rename = "allowlistedKeys", default)]
    pub allowlisted_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProposeConfigResponse {
    #[serde(rename = "proposalId")]
    pub proposal_id: String,
    #[serde(rename = "requiredApprovals")]
    pub required_approvals: u32,
}

pub async fn fetch_settings(token: &str) -> Result<PlatformSettingsResponse, ApiError> {
    let client = ApiClient::from_env();
    client
        .get_json("/api/platform/config", Some(token))
        .await
}

pub async fn propose_config_update(token: &str, config: &Value) -> Result<ProposeConfigResponse, ApiError> {
    let client = ApiClient::from_env();
    let body = serde_json::json!({ "config": config });
    client
        .post_json("/api/platform/config/propose-update", &body, Some(token))
        .await
}
