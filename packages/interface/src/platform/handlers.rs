use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use serde_json::json;

use application::{
    dto::governance::CreateGovernanceProposalCommand,
    platform_config::{filter_allowlisted_patch, ALLOWLISTED_KEYS},
    rbac::DEFAULT_TENANT_ID,
};

use crate::{
    config,
    env_config,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};
use serde_json::Value;

pub async fn health() -> Json<serde_json::Value> {
    let environment = env_config::app_environment();
    Json(json!({
        "ok": true,
        "environment": environment,
        "storage": "postgres",
        "dataOutsideRepository": true,
        "sqlite": false,
        "persistent": {
            "database": "postgresql"
        },
        "warnings": [],
    }))
}

pub async fn runtime() -> Json<serde_json::Value> {
    let environment = env_config::app_environment();
    let is_production = environment.eq_ignore_ascii_case("production");
    Json(json!({
        "environment": environment,
        "isProduction": is_production,
        "isStaging": environment.eq_ignore_ascii_case("staging"),
    }))
}

/// Environment health audit — mirrors Express `GET /api/platform/env-health`.
pub async fn env_health(
    State(_state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let bindings = config::audit_environment_bindings();
    let missing: Vec<Value> = bindings
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row: &&Value| {
            row.get("requiredInProduction")
                .and_then(|v: &Value| v.as_bool())
                .unwrap_or(false)
                && !row.get("configured").and_then(|v: &Value| v.as_bool()).unwrap_or(false)
        })
        .cloned()
        .collect();
    let present: Vec<Value> = bindings
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row: &&Value| {
            row.get("configured")
                .and_then(|v: &Value| v.as_bool())
                .unwrap_or(false)
        })
        .map(|row: &Value| row.get("name").cloned().unwrap_or(json!(null)))
        .collect();

    Ok(Json(json!({
        "ok": missing.is_empty(),
        "revision": 0,
        "gatewayMode": true,
        "source": "hostinger_process_env",
        "requiredMissing": missing,
        "requiredPresent": present,
        "unresolvedTokens": missing,
        "resolvedTokens": present,
        "capabilities": config::build_platform_capabilities(),
        "bindings": bindings,
    })))
}

#[derive(Debug, Deserialize)]
pub struct ProposeConfigUpdateRequest {
    pub config: Value,
}

pub async fn platform_settings(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let settings = state.platform_config.get_settings().await.map_err(AppErrorResponse::from)?;
    Ok(Json(json!({
        "ok": true,
        "settings": settings,
        "allowlistedKeys": ALLOWLISTED_KEYS,
    })))
}

pub async fn propose_config_update(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<ProposeConfigUpdateRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let patch = filter_allowlisted_patch(&body.config).map_err(AppErrorResponse::from)?;
    let proposal = state
        .governance
        .create
        .execute(
            ctx,
            env,
            CreateGovernanceProposalCommand {
                proposal_type: "config.update".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({ "config": patch }),
            },
        )
        .await
        .map_err(AppErrorResponse::from)?;

    Ok(Json(json!({
        "ok": true,
        "governanceRequired": true,
        "proposalId": proposal.id,
        "requiredApprovals": proposal.required_approvals,
    })))
}
