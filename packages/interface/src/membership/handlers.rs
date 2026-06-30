use application::{
    dto::tenant::command::MembershipCommand,
    rbac::{normalize_rbac_role, rbac_role_to_display},
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use domain::{RoleId, TenantId, UserId};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashSet;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListMembershipsQuery {
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
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
pub struct CreateMembershipRequest {
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    #[serde(rename = "roleSlugs", default)]
    pub role_slugs: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMembershipRoleRequest {
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    #[serde(rename = "roleSlugs", default)]
    pub role_slugs: Vec<String>,
}

fn role_slugs_from_request(single: Option<String>, many: &[String]) -> Vec<String> {
    if !many.is_empty() {
        return many
            .iter()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    single
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .into_iter()
        .collect()
}

fn membership_to_json(view: &application::dto::tenant::view::MembershipView) -> serde_json::Value {
    let roles: Vec<String> = view
        .roles
        .as_ref()
        .map(|set| {
            set.iter()
                .map(|r| {
                    r.as_str()
                        .rsplit_once(':')
                        .map(|(_, slug)| slug.to_string())
                        .unwrap_or_else(|| r.as_str().to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    json!({
        "userId": view.user_id.as_ref().map(|u| u.as_str()).unwrap_or(""),
        "tenantId": view.tenant_id.as_ref().map(|t| t.as_str()).unwrap_or(""),
        "roles": roles,
        "roleDisplay": roles.first().map(|slug| rbac_role_to_display(slug)),
        "createdAt": view.created_at.as_ref().map(|d| d.datetime()),
        "version": view.version,
    })
}

pub async fn list_memberships(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<ListMembershipsQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    if query.tenant_id.trim().is_empty() {
        return Err(AppErrorResponse::validation(
            "tenantId required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let rows = state
        .membership_uc
        .list
        .execute(
            ctx,
            env,
            TenantId::new(&query.tenant_id),
            query.page,
            query.page_size,
        )
        .await?;
    let memberships: Vec<_> = rows.iter().map(membership_to_json).collect();
    Ok(Json(json!({ "ok": true, "memberships": memberships })))
}

pub async fn get_membership(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path((user_id, tenant_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .membership_uc
        .get
        .execute(ctx, env, UserId::new(&user_id), TenantId::new(&tenant_id))
        .await?;
    Ok(Json(json!({ "ok": true, "membership": membership_to_json(&view) })))
}

pub async fn create_membership(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreateMembershipRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let user_id = body.user_id.trim();
    let tenant_id = body.tenant_id.trim();
    let slugs = role_slugs_from_request(body.role_slug.clone(), &body.role_slugs);
    if user_id.is_empty() || tenant_id.is_empty() || slugs.is_empty() {
        return Err(AppErrorResponse::validation(
            "userId, tenantId, and at least one role are required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let roles: HashSet<RoleId> = slugs
        .iter()
        .map(|slug| {
            let normalized = normalize_rbac_role(slug);
            RoleId::new(&format!("{tenant_id}:{normalized}"))
        })
        .collect();
    let view = state
        .membership_uc
        .create
        .execute(
            ctx,
            env,
            MembershipCommand {
                user_id: Some(UserId::new(user_id)),
                tenant_id: Some(TenantId::new(tenant_id)),
                roles: Some(roles),
                created_at: None,
                version: None,
            },
        )
        .await?;
    Ok(Json(json!({ "ok": true, "membership": membership_to_json(&view) })))
}

pub async fn update_membership_role(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path((user_id, tenant_id)): Path<(String, String)>,
    Json(body): Json<UpdateMembershipRoleRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let slugs = role_slugs_from_request(body.role_slug.clone(), &body.role_slugs);
    if slugs.is_empty() {
        return Err(AppErrorResponse::validation(
            "at least one roleSlug required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let view = state
        .membership_uc
        .set_role
        .execute_roles(
            ctx,
            env,
            UserId::new(&user_id),
            TenantId::new(&tenant_id),
            &slugs,
        )
        .await?;
    Ok(Json(json!({ "ok": true, "membership": membership_to_json(&view) })))
}

pub async fn delete_membership(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path((user_id, tenant_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let removed = state
        .membership_uc
        .delete
        .execute(ctx, env, UserId::new(&user_id), TenantId::new(&tenant_id))
        .await?;
    Ok(Json(json!({ "ok": true, "removed": removed })))
}
