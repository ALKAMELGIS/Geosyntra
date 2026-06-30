use application::{
    dto::invite::{AcceptInviteCommand, CreateInviteCommand},
    error::AppError,
    rbac::normalize_rbac_role,
};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use domain::Email;
use serde::Deserialize;
use serde_json::json;

use crate::{
    auth::handlers::AuthSessionJson,
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    rbac::mappers::{invite_preview_json, invite_to_json},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    pub email: String,
    #[serde(rename = "roleSlug")]
    pub role_slug: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AcceptInviteRequest {
    pub token: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct PreviewInviteQuery {
    pub token: String,
}

pub async fn list_invites(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state.rbac.list_invites.execute(ctx, env, 100).await?;
    let invites: Vec<_> = rows.iter().map(invite_to_json).collect();
    Ok(Json(json!({ "ok": true, "invites": invites })))
}

pub async fn create_invite(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreateInviteRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppErrorResponse> {
    let email = body.email.trim();
    if email.is_empty() {
        return Err(AppErrorResponse::from(AppError::ValidationError(
            "email_required".into(),
        )));
    }
    let email = Email::new(email).map_err(|e| AppErrorResponse::from(AppError::from(e)))?;
    let role_raw = body
        .role_slug
        .or(body.role)
        .unwrap_or_else(|| "manager".into());
    let role_slug = normalize_rbac_role(&role_raw).to_string();

    let invite = state
        .rbac
        .create_invite
        .execute(
            ctx,
            env,
            CreateInviteCommand {
                email,
                role_slug,
                invited_by_id: String::new(),
                invited_by_email: String::new(),
            },
        )
        .await?;

    let role_slug = invite
        .role_slug
        .as_deref()
        .map(normalize_rbac_role)
        .unwrap_or("manager");
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "invite": invite_preview_json(&invite),
            "token": invite.token.as_deref(),
            "roleSlug": role_slug,
        })),
    ))
}

pub async fn preview_invite(
    State(state): State<AppState>,
    Query(query): Query<PreviewInviteQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    match state.rbac.preview_invite.execute(&query.token).await {
        Ok(invite) => Ok(Json(json!({ "ok": true, "invite": invite_preview_json(&invite) }))),
        Err(AppError::ValidationError(code)) if code == "invite_expired" => {
            Err(AppErrorResponse::validation(code, StatusCode::GONE))
        }
        Err(AppError::ValidationError(code)) if code == "invalid_invite" => {
            Err(AppErrorResponse::validation(code, StatusCode::NOT_FOUND))
        }
        Err(AppError::ValidationError(code)) if code == "token_required" => {
            Err(AppErrorResponse::validation(code, StatusCode::BAD_REQUEST))
        }
        Err(e) => Err(AppErrorResponse::from(e)),
    }
}

pub async fn accept_invite(
    State(state): State<AppState>,
    Json(body): Json<AcceptInviteRequest>,
) -> Result<Json<AuthSessionJson>, AppErrorResponse> {
    if body.password.len() < 8 {
        return Err(AppErrorResponse::validation(
            "invalid_payload",
            StatusCode::BAD_REQUEST,
        ));
    }
    match state
        .rbac
        .accept_invite
        .execute(AcceptInviteCommand {
            token: body.token,
            name: body.name,
            password: body.password,
        })
        .await
    {
        Ok(session) => Ok(Json(session.into())),
        Err(AppError::ValidationError(code)) if code == "invite_expired" => {
            Err(AppErrorResponse::validation(code, StatusCode::GONE))
        }
        Err(AppError::ValidationError(code))
            if code == "invalid_invite" || code == "invalid_payload" =>
        {
            Err(AppErrorResponse::validation(code, StatusCode::NOT_FOUND))
        }
        Err(AppError::ValidationError(code)) if code == "email_exists" => {
            Err(AppErrorResponse::validation(code, StatusCode::CONFLICT))
        }
        Err(e) => Err(AppErrorResponse::from(e)),
    }
}
