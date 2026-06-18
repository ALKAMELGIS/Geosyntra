use application::error::AppError;
use application::dto::tenant::{
    command::TemporaryGrantCommand,
    view::TemporaryGrantView,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use domain::{Action, DateTime, Description, Resource, TenantId, UserId};
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListGrantsQuery {
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    100
}

#[derive(Debug, Deserialize)]
pub struct CreateGrantRequest {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    pub resource: String,
    pub action: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: i64,
}

fn grant_to_json(view: &TemporaryGrantView) -> serde_json::Value {
    json!({
        "id": view.id.as_deref().unwrap_or(""),
        "userId": view.user_id.as_ref().map(|u| u.as_str()).unwrap_or(""),
        "resource": view.resource.as_ref().map(|r| r.resource()).unwrap_or(""),
        "action": view.action.as_ref().map(|a| a.action()).unwrap_or(""),
        "description": view.description.as_ref().map(|d| d.description()).unwrap_or(""),
        "expiresAt": view.expires_at.as_ref().map(|d| d.datetime()),
        "createdAt": view.created_at.as_ref().map(|d| d.datetime()),
        "version": view.version,
    })
}

pub async fn list_grants(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<ListGrantsQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    if query.tenant_id.trim().is_empty() {
        return Err(AppErrorResponse::validation(
            "tenantId required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let rows = state
        .temporary_grant
        .list
        .execute(ctx, env, TenantId::new(&query.tenant_id), query.limit)
        .await?;
    let grants: Vec<_> = rows.iter().map(grant_to_json).collect();
    Ok(Json(json!({ "ok": true, "grants": grants })))
}

pub async fn create_grant(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreateGrantRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let user_id = body.user_id.trim();
    let tenant_id = body.tenant_id.trim();
    let resource = body.resource.trim();
    let action = body.action.trim();
    if user_id.is_empty() || tenant_id.is_empty() || resource.is_empty() || action.is_empty() {
        return Err(AppErrorResponse::validation(
            "userId, tenantId, resource, and action are required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let expires_at = if body.expires_at <= 0 {
        chrono::Utc::now().timestamp() + 86_400
    } else {
        body.expires_at
    };
    let description = body
        .description
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(Description::new)
        .transpose()
        .map_err(|e| AppErrorResponse::from(AppError::from(e)))?;

    let view = state
        .temporary_grant
        .create
        .execute(
            ctx,
            env,
            TenantId::new(tenant_id),
            TemporaryGrantCommand {
                user_id: Some(UserId::new(user_id)),
                description,
                resource: Some(Resource::new(resource).map_err(|e| AppErrorResponse::from(AppError::from(e)))?),
                action: Some(Action::new(action).map_err(|e| AppErrorResponse::from(AppError::from(e)))?),
                expires_at: Some(DateTime::new(expires_at)),
                created_at: None,
                version: None,
            },
        )
        .await?;
    Ok(Json(json!({ "ok": true, "grant": grant_to_json(&view) })))
}

pub async fn revoke_grant(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let revoked = state
        .temporary_grant
        .revoke
        .execute(ctx, env, &id)
        .await?;
    Ok(Json(json!({ "ok": true, "revoked": revoked })))
}
