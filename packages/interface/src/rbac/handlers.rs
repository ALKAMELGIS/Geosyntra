use application::{
    authorization::resolve_resource_tenant,
    dto::user::command::UserCommand,
    error::AppError,
    rbac::rbac_role_to_display,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use domain::{Email, UserId};
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    rbac::{
        mappers::{audit_entry_to_json, user_view_to_public},
        user_form::{default_admin_password, UserProfileFields},
    },
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct PatchUserRequest {
    #[serde(flatten)]
    pub fields: UserProfileFields,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    pub role: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    #[serde(flatten)]
    pub fields: UserProfileFields,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
}

pub(crate) fn parse_user_id(raw: &str) -> Result<UserId, AppErrorResponse> {
    if raw.parse::<i64>().ok().filter(|id| *id > 0).is_some() {
        return Ok(UserId::new(raw));
    }
    Err(AppErrorResponse::from(AppError::ValidationError(
        "invalid_id".into(),
    )))
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    #[serde(default = "default_audit_limit")]
    pub limit: u32,
}

fn default_audit_limit() -> u32 {
    100
}

pub async fn list_audit(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<AuditQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state
        .rbac
        .list_audit
        .execute(ctx, env, query.limit)
        .await?;
    let audit: Vec<_> = rows.iter().map(audit_entry_to_json).collect();
    Ok(Json(json!({ "ok": true, "audit": audit })))
}

pub async fn permissions_matrix(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let matrix = state
        .rbac
        .export_permissions_matrix
        .execute(ctx, env)
        .await?;
    let rows: Vec<serde_json::Value> = matrix
        .iter()
        .map(|row| {
            json!({
                "role": row.role,
                "permissions": row.permissions,
                "rank": row.rank,
            })
        })
        .collect();
    Ok(Json(json!({ "ok": true, "matrix": rows })))
}

async fn resolve_target_tenant(
    state: &AppState,
    ctx: &application::SubjectContext,
    user_id: &UserId,
) -> Result<domain::TenantId, AppErrorResponse> {
    resolve_resource_tenant(state.membership.as_ref(), ctx, Some(user_id))
        .await
        .map_err(AppErrorResponse::from)
}

pub async fn approve_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_user_id(&id)?;
    let tenant = resolve_target_tenant(&state, &ctx, &id).await?;
    state
        .rbac
        .approve_user
        .execute(ctx, env, &tenant, id)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn suspend_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_user_id(&id)?;
    let tenant = resolve_target_tenant(&state, &ctx, &id).await?;
    state.rbac.suspend_user.execute(ctx, env, &tenant, id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn reactivate_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_user_id(&id)?;
    let tenant = resolve_target_tenant(&state, &ctx, &id).await?;
    state
        .rbac
        .reactivate_user
        .execute(ctx, env, &tenant, id)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_user_id(&id)?;
    if id.as_str() == ctx.user_id().as_str() {
        return Err(AppErrorResponse::from(application::error::AppError::ValidationError(
            "cannot_delete_self".into(),
        )));
    }
    let tenant = resolve_target_tenant(&state, &ctx, &id).await?;
    state.rbac.delete_user.execute(ctx, env, &tenant, id).await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn create_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreateUserRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let email_raw = body.email.trim();
    if email_raw.is_empty() {
        return Err(AppErrorResponse::validation(
            "email is required",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    let email = Email::new(email_raw).map_err(|e| AppErrorResponse::from(AppError::from(e)))?;
    let username = body.fields.resolve_username(email_raw)?;
    let mut profile = body
        .fields
        .profile_command()?
        .unwrap_or_default();
    if profile.first_name.is_none() {
        profile.first_name = Some(body.fields.resolve_first_name()?);
    }
    if profile.last_name.is_none() {
        profile.last_name = Some(body.fields.resolve_last_name()?);
    }
    if profile.password.is_none() {
        profile.password = Some(default_admin_password()?);
    }
    let role_display = body
        .role_slug
        .as_deref()
        .map(|slug| rbac_role_to_display(slug).to_string());

    let view = state
        .rbac
        .create_user
        .execute(
            ctx,
            env,
            UserCommand {
                email: Some(email),
                username: Some(username),
                profile: Some(profile),
                preferences: body.fields.preferences_command(),
                role_display,
                ..Default::default()
            },
        )
        .await?;
    Ok(Json(json!({ "ok": true, "user": user_view_to_public(view) })))
}

pub async fn patch_user(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
    Json(body): Json<PatchUserRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_user_id(&id)?;
    let tenant = resolve_target_tenant(&state, &ctx, &id).await?;

    if let Some(role_raw) = body.role_slug.or(body.role) {
        if id.as_str() == ctx.user_id().as_str() {
            return Err(AppErrorResponse::from(AppError::ValidationError(
                "cannot_change_own_role".into(),
            )));
        }
        state
            .rbac
            .set_user_role
            .execute(ctx.clone(), env.clone(), id.clone(), tenant.clone(), &role_raw)
            .await?;
    }

    if body.fields.name.is_some()
        || body.fields.first_name.is_some()
        || body.fields.last_name.is_some()
        || body.fields.username.is_some()
        || body.fields.bio.is_some()
        || body.fields.phone_number.is_some()
        || body.fields.website.is_some()
        || body.fields.avatar_url.is_some()
        || body.fields.password.is_some()
        || body.fields.email_notifications.is_some()
        || body.fields.push_notifications.is_some()
        || body.fields.two_factor_auth.is_some()
        || body.fields.language.is_some()
        || body.email.is_some()
    {
        let mut cmd = UserCommand {
            id: Some(id.clone()),
            ..Default::default()
        };
        if let Some(email_raw) = body.email.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            cmd.email = Some(Email::new(email_raw).map_err(|e| AppErrorResponse::from(AppError::from(e)))?);
        }
        if let Some(username) = body
            .fields
            .username
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            cmd.username = Some(
                domain::Username::new(username)
                    .map_err(|e| AppErrorResponse::from(AppError::from(e)))?,
            );
        }
        if let Some(profile) = body.fields.profile_command()? {
            cmd.profile = Some(profile);
        }
        if let Some(prefs) = body.fields.preferences_command() {
            cmd.preferences = Some(prefs);
        }
        state.rbac.update_user.execute(ctx, env, cmd).await?;
    }

    Ok(Json(json!({ "ok": true })))
}

pub async fn list_users(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state
        .rbac
        .list_users
        .execute(ctx, env, &[], 1, 500)
        .await?;
    let users: Vec<_> = rows.into_iter().map(user_view_to_public).collect();
    Ok(Json(json!({ "ok": true, "users": users })))
}
