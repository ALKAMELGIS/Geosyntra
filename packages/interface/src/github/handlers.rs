use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{env_config, error::AppErrorResponse};

fn pct_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn github_client_id() -> Option<String> {
    ["GITHUB_CLIENT_ID", "AUTH_GITHUB_CLIENT_ID", "GITHUB_OAUTH_CLIENT_ID"]
        .iter()
        .find_map(|k| env_config::trim_env_public(k))
}

fn app_origin() -> String {
    env_config::trim_env_public("APP_ORIGIN")
        .unwrap_or_else(|| "http://localhost:5173".into())
        .trim_end_matches('/')
        .to_string()
}

fn github_oauth_redirect_url() -> String {
    env_config::trim_env_public("GITHUB_OAUTH_REDIRECT_URL").unwrap_or_else(|| {
        format!("{}/api/github/oauth/callback", app_origin())
    })
}

/// GitHub OAuth connection status — session store deferred; returns disconnected stub.
pub async fn github_status() -> Json<serde_json::Value> {
    Json(json!({
        "connected": false,
        "scope": "",
    }))
}

/// Recent GitHub webhook/event feed — in-memory stream deferred.
pub async fn github_events() -> Json<serde_json::Value> {
    Json(json!({ "items": [] }))
}

pub async fn github_disconnect() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}

pub async fn github_oauth_start() -> Result<Response, AppErrorResponse> {
    let client_id = github_client_id().ok_or_else(|| {
        AppErrorResponse::validation(
            "GitHub OAuth is not configured (missing GITHUB_CLIENT_ID).",
            StatusCode::INTERNAL_SERVER_ERROR,
        )
    })?;
    let scope = "read:user repo admin:repo_hook";
    let state = uuid::Uuid::new_v4().to_string();
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
        pct_encode(&client_id),
        pct_encode(&github_oauth_redirect_url()),
        pct_encode(scope),
        pct_encode(&state),
    );
    Ok(Redirect::temporary(&url).into_response())
}

#[derive(Debug, Deserialize)]
pub struct GithubOAuthCallbackQuery {
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
}

pub async fn github_oauth_callback(
    Query(params): Query<GithubOAuthCallbackQuery>,
) -> Redirect {
    let origin = app_origin();
    let code = params.code.unwrap_or_default();
    if code.trim().is_empty() {
        return Redirect::temporary(&format!(
            "{origin}/admin/github?error={}",
            pct_encode("Missing code")
        ));
    }
    Redirect::temporary(&format!(
        "{origin}/admin/github?error={}",
        pct_encode("GitHub OAuth session store not implemented")
    ))
}

pub async fn github_repos() -> Result<Json<Value>, AppErrorResponse> {
    Err(github_not_connected())
}

#[derive(Debug, Deserialize)]
pub struct RepoPath {
    pub owner: String,
    pub repo: String,
}

fn github_not_connected() -> AppErrorResponse {
    AppErrorResponse::validation("GitHub not connected.", StatusCode::UNAUTHORIZED)
}

pub async fn github_repo_issues(
    Path(_params): Path<RepoPath>,
) -> Result<Json<Value>, AppErrorResponse> {
    Err(github_not_connected())
}

pub async fn github_repo_pulls(
    Path(_params): Path<RepoPath>,
) -> Result<Json<Value>, AppErrorResponse> {
    Err(github_not_connected())
}

pub async fn github_create_issue(
    Path(_params): Path<RepoPath>,
    Json(_body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    Err(github_not_connected())
}
