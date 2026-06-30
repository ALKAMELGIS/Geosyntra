use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use domain::{tenant::environment::Environment, Email};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    auth::lifecycle_handlers::{map_lifecycle_error, normalize_email},
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ProfileExtraQuery {
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PutProfileExtraBody {
    pub email: Option<String>,
    pub profile: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordBody {
    pub email: Option<String>,
    #[serde(rename = "currentPassword")]
    pub current_password: Option<String>,
    #[serde(rename = "newPassword")]
    pub new_password: Option<String>,
}

async fn resolve_email(
    state: &AppState,
    ctx: application::SubjectContext,
    env: Environment,
    requested: Option<&str>,
) -> Result<Email, AppErrorResponse> {
    if let Some(raw) = requested.and_then(normalize_email) {
        let session = state.get_me.execute(ctx, env).await?;
        let session_email = session
            .email
            .as_ref()
            .map(|e| e.email().to_ascii_lowercase());
        if session_email.as_deref() != Some(raw.email()) {
            return Err(AppErrorResponse::from(application::error::AppError::Forbidden));
        }
        return Ok(raw);
    }
    let session = state.get_me.execute(ctx, env).await?;
    session
        .email
        .ok_or_else(|| AppErrorResponse::validation("email_required", StatusCode::BAD_REQUEST))
}

pub async fn get_profile_extra(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<ProfileExtraQuery>,
) -> Result<Json<Value>, AppErrorResponse> {
    let email = resolve_email(
        &state,
        ctx,
        env,
        query.email.as_deref(),
    )
    .await?;
    let profile = state
        .auth_lifecycle
        .get_profile_extra
        .execute(&email)
        .await
        .map_err(map_lifecycle_error)?;
    Ok(Json(json!({ "ok": true, "profile": profile })))
}

pub async fn put_profile_extra(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<PutProfileExtraBody>,
) -> Result<Json<Value>, AppErrorResponse> {
    let email = resolve_email(
        &state,
        ctx,
        env,
        body.email.as_deref(),
    )
    .await?;
    let patch = body.profile.unwrap_or_else(|| json!({}));
    let profile = state
        .auth_lifecycle
        .put_profile_extra
        .execute(&email, patch)
        .await
        .map_err(map_lifecycle_error)?;
    Ok(Json(json!({ "ok": true, "profile": profile })))
}

pub async fn change_password(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<ChangePasswordBody>,
) -> Result<Json<Value>, AppErrorResponse> {
    let email = resolve_email(
        &state,
        ctx,
        env,
        body.email.as_deref(),
    )
    .await?;
    let current = body.current_password.as_deref().unwrap_or("").trim();
    let new_password = body.new_password.as_deref().unwrap_or("").trim();
    state
        .auth_lifecycle
        .change_password
        .execute(&email, current, new_password)
        .await
        .map_err(map_lifecycle_error)?;
    Ok(Json(json!({
        "ok": true,
        "message": "Password updated successfully."
    })))
}
