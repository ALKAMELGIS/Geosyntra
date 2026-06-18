use application::rbac::DEFAULT_TENANT_ID;
use application::dto::{
    governance::CreateGovernanceProposalCommand,
    tenant::view::TenantView,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use domain::TenantId;
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListTenantsQuery {
    #[serde(default = "default_page")]
    pub page: u32,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
}

fn default_page() -> u32 {
    1
}

fn default_page_size() -> u32 {
    100
}

#[derive(Debug, Deserialize)]
pub struct ProposeTenantCreateRequest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ProposeTenantUpdateRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
}

fn tenant_to_json(view: &TenantView) -> serde_json::Value {
    json!({
        "id": view.id.as_ref().map(|t| t.as_str()).unwrap_or(""),
        "name": view.name.as_ref().and_then(|n| Some(n.name())).unwrap_or(""),
        "description": view.description.as_ref().map(|d| d.description()).unwrap_or(""),
        "isPlatformTenant": view.is_platform_tenant.unwrap_or(false),
        "createdAt": view.created_at.as_ref().map(|d| d.datetime()),
    })
}

pub async fn list_tenants(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<ListTenantsQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state
        .tenant
        .list
        .execute(ctx, env, query.page, query.page_size)
        .await?;
    let tenants: Vec<_> = rows.iter().map(tenant_to_json).collect();
    Ok(Json(json!({ "ok": true, "tenants": tenants })))
}

pub async fn get_tenant(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .tenant
        .get
        .execute(ctx, env, TenantId::new(&id))
        .await?;
    Ok(Json(json!({ "ok": true, "tenant": tenant_to_json(&view) })))
}

pub async fn propose_tenant_create(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<ProposeTenantCreateRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = body.id.trim().to_string();
    let name = body.name.trim().to_string();
    if id.is_empty() || name.is_empty() {
        return Err(AppErrorResponse::validation(
            "id and name are required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    if id == DEFAULT_TENANT_ID {
        return Err(AppErrorResponse::validation(
            "cannot_propose_platform_tenant",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }

    let proposal = state
        .governance
        .create
        .execute(
            ctx,
            env,
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.create".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({
                    "id": id,
                    "name": name,
                    "description": body.description,
                    "config": body.config,
                }),
            },
        )
        .await?;

    Ok(Json(json!({
        "ok": true,
        "governanceRequired": true,
        "proposalId": proposal.id,
        "requiredApprovals": proposal.required_approvals,
    })))
}

pub async fn propose_tenant_update(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
    Json(body): Json<ProposeTenantUpdateRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Err(AppErrorResponse::validation(
            "name is required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }

    let proposal = state
        .governance
        .create
        .execute(
            ctx,
            env,
            CreateGovernanceProposalCommand {
                proposal_type: "tenant.update".into(),
                tenant_id: DEFAULT_TENANT_ID.into(),
                payload: json!({
                    "id": id,
                    "name": name,
                    "description": body.description,
                    "config": body.config,
                }),
            },
        )
        .await?;

    Ok(Json(json!({
        "ok": true,
        "governanceRequired": true,
        "proposalId": proposal.id,
        "requiredApprovals": proposal.required_approvals,
    })))
}
