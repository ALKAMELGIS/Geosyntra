use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use domain::Email;
use serde::Deserialize;
use serde_json::json;

use crate::{
    auth::{cooldown, handlers::PublicUserJson},
    env_config,
    error::AppErrorResponse,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct EmailBody {
    pub email: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordBody {
    pub token: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VerifyEmailQuery {
    pub token: Option<String>,
}

pub(crate) fn normalize_email(raw: &str) -> Option<Email> {
    let email = raw.trim();
    if email.is_empty() || !email.contains('@') {
        None
    } else {
        Email::new(email).ok()
    }
}

fn verification_link(token: &str) -> String {
    format!("/app/auth/verify-email?token={token}")
}

fn password_reset_link(token: &str) -> String {
    format!("/app/auth/reset-password?token={token}")
}

pub(crate) fn map_lifecycle_error(err: application::error::AppError) -> AppErrorResponse {
    match err {
        application::error::AppError::ValidationError(code) => {
            let status = match code.as_str() {
                "token_expired" | "invalid_token" | "token_required" | "password_too_short"
                | "email_required" | "already_verified" | "oauth_only" | "not_found" => {
                    StatusCode::BAD_REQUEST
                }
                "email_not_configured" => StatusCode::SERVICE_UNAVAILABLE,
                _ => StatusCode::BAD_REQUEST,
            };
            AppErrorResponse::validation(code, status)
        }
        other => AppErrorResponse::from(other),
    }
}

/// Mirrors Express generic success — does not leak account existence.
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(body): Json<EmailBody>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let Some(email) = body.email.as_deref().and_then(normalize_email) else {
        return Err(AppErrorResponse::validation(
            "email_required",
            StatusCode::BAD_REQUEST,
        ));
    };

    if let Err(retry_after) = cooldown::check_cooldown(&format!("reset:{}", email.email())) {
        return Err(AppErrorResponse::validation(
            format!("reset_cooldown:{retry_after}"),
            StatusCode::TOO_MANY_REQUESTS,
        ));
    }

    let result = state
        .auth_lifecycle
        .forgot_password
        .execute(email.clone(), || {
            (
                cooldown::generate_verification_token(),
                cooldown::password_reset_expires_at(),
            )
        })
        .await
        .map_err(map_lifecycle_error)?;

    if result.oauth_only {
        return Err(AppErrorResponse::validation(
            "oauth_only",
            StatusCode::BAD_REQUEST,
        ));
    }

    let generic = json!({
        "ok": true,
        "message": "If an account exists for this email, password reset instructions were sent.",
    });

    if !result.user_exists || result.token.is_empty() {
        return Ok(Json(generic));
    }

    if !env_config::has_email_config() {
        if env_config::is_production() {
            return Err(AppErrorResponse::validation(
                "email_not_configured",
                StatusCode::SERVICE_UNAVAILABLE,
            ));
        }
        cooldown::mark_sent(&format!("reset:{}", email.email()));
        return Ok(Json(json!({
            "ok": true,
            "message": "Development mode: use the reset link below.",
            "devResetLink": password_reset_link(&result.token),
            "emailConfigured": false,
        })));
    }

    cooldown::mark_sent(&format!("reset:{}", email.email()));
    Ok(Json(json!({
        "ok": true,
        "message": "Password reset email sent. Check your inbox.",
        "emailConfigured": true,
    })))
}

pub async fn reset_password(
    State(state): State<AppState>,
    Json(body): Json<ResetPasswordBody>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    state
        .auth_lifecycle
        .reset_password
        .execute(
            body.token.as_deref().unwrap_or(""),
            body.password.as_deref().unwrap_or(""),
        )
        .await
        .map_err(map_lifecycle_error)?;
    Ok(Json(json!({
        "ok": true,
        "message": "Password updated. You can sign in with your new password.",
    })))
}

pub async fn verify_email(
    State(state): State<AppState>,
    Query(query): Query<VerifyEmailQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let result = state
        .auth_lifecycle
        .verify_email
        .execute(query.token.as_deref().unwrap_or(""))
        .await
        .map_err(map_lifecycle_error)?;
    Ok(Json(json!({
        "ok": true,
        "user": PublicUserJson::from(result.user),
        "accessToken": result.access_token,
        "pendingApproval": result.pending_approval,
    })))
}

pub async fn resend_verification(
    State(state): State<AppState>,
    Json(body): Json<EmailBody>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let Some(email) = body.email.as_deref().and_then(normalize_email) else {
        return Err(AppErrorResponse::validation(
            "email_required",
            StatusCode::BAD_REQUEST,
        ));
    };

    if let Err(retry_after) = cooldown::check_cooldown(email.email()) {
        return Err(AppErrorResponse::validation(
            format!("resend_cooldown:{retry_after}"),
            StatusCode::TOO_MANY_REQUESTS,
        ));
    }

    let result = state
        .auth_lifecycle
        .resend_verification
        .execute(email.clone(), || {
            (
                cooldown::generate_verification_token(),
                cooldown::verification_expires_at(),
            )
        })
        .await
        .map_err(map_lifecycle_error)?;

    if !result.user_exists {
        return Ok(Json(json!({
            "ok": true,
            "message": "If an account exists, a verification email was sent.",
        })));
    }

    if !env_config::has_email_config() {
        if env_config::is_production() {
            return Err(AppErrorResponse::validation(
                "email_not_configured",
                StatusCode::SERVICE_UNAVAILABLE,
            ));
        }
        cooldown::mark_sent(email.email());
        return Ok(Json(json!({
            "ok": true,
            "devVerificationLink": verification_link(&result.token),
            "emailConfigured": false,
        })));
    }

    cooldown::mark_sent(email.email());
    Ok(Json(json!({
        "ok": true,
        "emailConfigured": true,
    })))
}

#[derive(Debug, Deserialize)]
pub struct SendVerificationEmailBody {
    pub email: Option<String>,
    #[serde(rename = "verificationLink")]
    pub verification_link: Option<String>,
    #[serde(rename = "appName")]
    pub app_name: Option<String>,
}

pub async fn send_verification_email(
    Json(body): Json<SendVerificationEmailBody>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let email = body.email.as_deref().unwrap_or("").trim();
    let verification_link = body.verification_link.as_deref().unwrap_or("").trim();
    if email.is_empty() || verification_link.is_empty() {
        return Err(AppErrorResponse::validation(
            "email and verificationLink are required.",
            StatusCode::BAD_REQUEST,
        ));
    }
    if !env_config::has_email_config() {
        return Err(AppErrorResponse::validation(
            "SMTP is not configured on server.",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn forgot_username(
    State(state): State<AppState>,
    Json(body): Json<EmailBody>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let Some(email) = body.email.as_deref().and_then(normalize_email) else {
        return Err(AppErrorResponse::validation(
            "email_required",
            StatusCode::BAD_REQUEST,
        ));
    };

    let hint = state
        .auth_lifecycle
        .forgot_username
        .execute(email)
        .await
        .map_err(map_lifecycle_error)?;

    if !hint.found {
        return Ok(Json(json!({
            "ok": true,
            "found": false,
            "message": "No GeoSyntra account was found for this email. Check the spelling or sign up for a new workspace.",
        })));
    }

    if hint.oauth_only {
        let providers = if hint.oauth_providers.is_empty() {
            "social sign-in".to_string()
        } else {
            hint.oauth_providers.join(", ")
        };
        return Ok(Json(json!({
            "ok": true,
            "found": true,
            "signInId": hint.sign_in_id,
            "username": hint.username,
            "oauthOnly": true,
            "message": format!("This account uses {providers} only (no password). Sign in with the same provider you used when registering."),
        })));
    }

    let sign_in_id = hint.sign_in_id.unwrap_or_default();
    let username = hint.username.unwrap_or_else(|| sign_in_id.clone());
    let message = if username != sign_in_id {
        format!("Sign in with email {sign_in_id} (display name: {username}).")
    } else {
        format!("Sign in with email {sign_in_id}.")
    };

    Ok(Json(json!({
        "ok": true,
        "found": true,
        "signInId": sign_in_id,
        "username": username,
        "message": message,
    })))
}
