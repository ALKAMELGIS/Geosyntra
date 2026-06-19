//! OAuth authorization-code exchange — Google, GitHub, LinkedIn (Express parity).

use axum::Json;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

use crate::{env_config, error::AppErrorResponse};

fn missing_code_error(provider: &str) -> AppErrorResponse {
    let error = match provider {
        "google" => "oauth_google_missing_config_or_code",
        "github" => "oauth_github_missing_config_or_code",
        "linkedin" => "oauth_linkedin_missing_config_or_code",
        _ => "oauth_missing_config_or_code",
    };
    AppErrorResponse::validation(error, axum::http::StatusCode::BAD_REQUEST)
}

fn decode_jwt_payload(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let padded = match payload.len() % 4 {
        0 => payload.to_string(),
        n => format!("{payload}{}", "=".repeat(4 - n)),
    };
    let bytes = URL_SAFE_NO_PAD.decode(padded.as_bytes()).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn read_code_and_redirect(body: &Value) -> Result<(String, String), AppErrorResponse> {
    let code = body
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let redirect_uri = body
        .get("redirect_uri")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if code.is_empty() {
        return Err(AppErrorResponse::validation(
            "oauth_missing_code",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    Ok((code, redirect_uri))
}

pub async fn google_exchange(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    let (code, redirect_uri) = read_code_and_redirect(&body)?;
    let client_id = env_config::oauth_client_id_public("google");
    let client_secret = env_config::oauth_client_secret("google");
    let redirect = if redirect_uri.is_empty() {
        env_config::trim_env_public("GOOGLE_OAUTH_REDIRECT_URI")
            .or_else(|| env_config::trim_env_public("LINKEDIN_OAUTH_REDIRECT_URI"))
            .unwrap_or_default()
    } else {
        redirect_uri
    };
    if client_id.is_empty() || client_secret.is_empty() || redirect.is_empty() {
        return Err(missing_code_error("google"));
    }

    let client = reqwest::Client::new();
    let token_res = client
        .post("https://oauth2.googleapis.com/token")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(format!(
            "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code",
            urlencoding::encode(&code),
            urlencoding::encode(&client_id),
            urlencoding::encode(&client_secret),
            urlencoding::encode(&redirect),
        ))
        .send()
        .await
        .map_err(|_| {
            AppErrorResponse::validation(
                "google_token_failed",
                axum::http::StatusCode::UNAUTHORIZED,
            )
        })?;

    let token_json: Value = token_res.json().await.map_err(|_| {
        AppErrorResponse::validation("google_token_failed", axum::http::StatusCode::UNAUTHORIZED)
    })?;
    let id_token = token_json
        .get("id_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if id_token.is_empty() {
        return Err(AppErrorResponse::validation(
            "google_no_id_token",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }
    let payload = decode_jwt_payload(id_token).ok_or_else(|| {
        AppErrorResponse::validation("google_token_malformed", axum::http::StatusCode::UNAUTHORIZED)
    })?;
    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if email.is_empty() {
        return Err(AppErrorResponse::validation(
            "google_email_missing",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }
    let name = payload
        .get("name")
        .or_else(|| payload.get("given_name"))
        .and_then(|v| v.as_str())
        .unwrap_or(&email)
        .trim()
        .to_string();
    let sub = payload
        .get("sub")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(Json(json!({ "ok": true, "email": email, "name": name, "sub": sub })))
}

pub async fn github_exchange(Json(body): Json<Value>) -> Result<Json<Value>, AppErrorResponse> {
    let (code, redirect_uri) = read_code_and_redirect(&body)?;
    let client_id = env_config::oauth_client_id_public("github");
    let client_secret = env_config::oauth_client_secret("github");
    let redirect = if redirect_uri.is_empty() {
        env_config::trim_env_public("AUTH_GITHUB_REDIRECT_URI")
            .or_else(|| env_config::trim_env_public("GITHUB_OAUTH_REDIRECT_URL"))
            .unwrap_or_default()
    } else {
        redirect_uri
    };
    if client_id.is_empty() || client_secret.is_empty() || redirect.is_empty() {
        return Err(missing_code_error("github"));
    }

    let client = reqwest::Client::new();
    let token_res = client
        .post("https://github.com/login/oauth/access_token")
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect,
        }))
        .send()
        .await
        .map_err(|_| {
            AppErrorResponse::validation(
                "github_token_failed",
                axum::http::StatusCode::UNAUTHORIZED,
            )
        })?;
    let token_json: Value = token_res.json().await.map_err(|_| {
        AppErrorResponse::validation("github_token_failed", axum::http::StatusCode::UNAUTHORIZED)
    })?;
    let access_token = token_json
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if access_token.is_empty() {
        return Err(AppErrorResponse::validation(
            "github_token_failed",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }

    let user_res = client
        .get("https://api.github.com/user")
        .header(ACCEPT, "application/vnd.github+json")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| {
            AppErrorResponse::validation("github_user_failed", axum::http::StatusCode::UNAUTHORIZED)
        })?;
    let user: Value = user_res.json().await.map_err(|_| {
        AppErrorResponse::validation("github_user_failed", axum::http::StatusCode::UNAUTHORIZED)
    })?;

    let mut email = user
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if email.is_empty() {
        let emails_res = client
            .get("https://api.github.com/user/emails")
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {access_token}"))
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await
            .map_err(|_| {
                AppErrorResponse::validation(
                    "github_email_missing",
                    axum::http::StatusCode::UNAUTHORIZED,
                )
            })?;
        let emails: Value = emails_res.json().await.unwrap_or(Value::Null);
        if let Some(list) = emails.as_array() {
            let pick = list
                .iter()
                .find(|e| e.get("primary").and_then(|v| v.as_bool()) == Some(true) && e.get("verified").and_then(|v| v.as_bool()) == Some(true))
                .or_else(|| list.iter().find(|e| e.get("verified").and_then(|v| v.as_bool()) == Some(true)))
                .or_else(|| list.first());
            email = pick
                .and_then(|e| e.get("email"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase();
        }
    }
    if email.is_empty() {
        return Err(AppErrorResponse::validation(
            "github_email_missing",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }
    let name = user
        .get("name")
        .or_else(|| user.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or(&email)
        .trim()
        .to_string();
    let sub = user
        .get("id")
        .map(|v| v.to_string())
        .or_else(|| user.get("login").and_then(|v| v.as_str()).map(str::to_string))
        .unwrap_or_default();
    Ok(Json(json!({ "ok": true, "email": email, "name": name, "sub": sub })))
}

pub async fn linkedin_exchange(
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    let (code, redirect_uri) = read_code_and_redirect(&body)?;
    let client_id = env_config::oauth_client_id_public("linkedin");
    let client_secret = env_config::oauth_client_secret("linkedin");
    let redirect = if redirect_uri.is_empty() {
        env_config::trim_env_public("LINKEDIN_OAUTH_REDIRECT_URI")
            .or_else(|| env_config::trim_env_public("GOOGLE_OAUTH_REDIRECT_URI"))
            .unwrap_or_default()
    } else {
        redirect_uri
    };
    if client_id.is_empty() || client_secret.is_empty() || redirect.is_empty() {
        return Err(missing_code_error("linkedin"));
    }

    let client = reqwest::Client::new();
    let token_res = client
        .post("https://www.linkedin.com/oauth/v2/accessToken")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(format!(
            "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&client_secret={}",
            urlencoding::encode(&code),
            urlencoding::encode(&redirect),
            urlencoding::encode(&client_id),
            urlencoding::encode(&client_secret),
        ))
        .send()
        .await
        .map_err(|_| {
            AppErrorResponse::validation(
                "linkedin_token_failed",
                axum::http::StatusCode::UNAUTHORIZED,
            )
        })?;
    let token_json: Value = token_res.json().await.map_err(|_| {
        AppErrorResponse::validation(
            "linkedin_token_failed",
            axum::http::StatusCode::UNAUTHORIZED,
        )
    })?;
    let access_token = token_json
        .get("access_token")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if access_token.is_empty() {
        return Err(AppErrorResponse::validation(
            "linkedin_token_failed",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }

    let profile_res = client
        .get("https://api.linkedin.com/v2/userinfo")
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|_| {
            AppErrorResponse::validation(
                "linkedin_user_failed",
                axum::http::StatusCode::UNAUTHORIZED,
            )
        })?;
    let profile: Value = profile_res.json().await.map_err(|_| {
        AppErrorResponse::validation(
            "linkedin_user_failed",
            axum::http::StatusCode::UNAUTHORIZED,
        )
    })?;
    let email = profile
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if email.is_empty() {
        return Err(AppErrorResponse::validation(
            "linkedin_email_missing",
            axum::http::StatusCode::UNAUTHORIZED,
        ));
    }
    let name = profile
        .get("name")
        .or_else(|| profile.get("given_name"))
        .and_then(|v| v.as_str())
        .unwrap_or(&email)
        .trim()
        .to_string();
    let sub = profile
        .get("sub")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(Json(json!({ "ok": true, "email": email, "name": name, "sub": sub })))
}

pub async fn apple_exchange(Json(body): Json<Value>) -> Result<Json<Value>, AppErrorResponse> {
    let code = body
        .get("code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let identity_token = body
        .get("identity_token")
        .or_else(|| body.get("identityToken"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if code.is_empty() && identity_token.is_empty() {
        return Err(AppErrorResponse::validation(
            "apple_oauth_missing_config_or_token",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    if env_config::trim_env_public("APPLE_OAUTH_CLIENT_ID")
        .filter(|v| !v.is_empty())
        .is_none()
    {
        return Err(AppErrorResponse::validation(
            "apple_oauth_missing_server_keys",
            axum::http::StatusCode::BAD_REQUEST,
        ));
    }
    Err(AppErrorResponse::validation(
        "oauth_apple_not_implemented",
        axum::http::StatusCode::NOT_IMPLEMENTED,
    ))
}
