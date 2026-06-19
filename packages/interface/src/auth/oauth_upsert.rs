use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use application::error::AppError;
use serde::Deserialize;

use application::dto::auth::UpsertOAuthCommand;

use crate::{
    auth::handlers::{AuthSessionJson, PublicUserJson},
    error::AppErrorResponse,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct OAuthUpsertRequest {
    pub email: String,
    pub name: String,
    pub provider: String,
    #[serde(default)]
    pub sub: Option<String>,
    #[serde(default = "default_remember")]
    pub remember: bool,
}

fn default_remember() -> bool {
    true
}

pub async fn oauth_upsert(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<OAuthUpsertRequest>,
) -> Result<Json<AuthSessionJson>, AppErrorResponse> {
    let email = domain::Email::new(body.email.trim()).map_err(|e| AppErrorResponse::from(AppError::from(e)))?;
    let provider = body.provider.trim().to_ascii_lowercase();
    if !["google", "github", "linkedin", "apple"].contains(&provider.as_str()) {
        return Err(AppErrorResponse::validation(
            "invalid_oauth_payload",
            StatusCode::BAD_REQUEST,
        ));
    }
    let sub = body.sub.unwrap_or_default().trim().to_string();
    if sub.is_empty() {
        return Err(AppErrorResponse::validation(
            "oauth_sub_required",
            StatusCode::BAD_REQUEST,
        ));
    }

    let user_agent = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let remember = body.remember;

    let session = state
        .oauth_upsert
        .execute(
            UpsertOAuthCommand {
                email,
                name: body.name,
                provider,
                sub,
                remember,
            },
            user_agent,
        )
        .await?;

    Ok(Json(AuthSessionJson {
        user: PublicUserJson::from(session.user),
        access_token: session.access_token,
        refresh_token: session.refresh_token,
    }))
}
