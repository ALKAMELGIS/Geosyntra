use axum::{
    http::StatusCode,
    response::Redirect,
    Json,
};
use serde_json::json;

use crate::env_config;

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

fn spa_oauth_error_redirect(code: &str, message: Option<&str>) -> String {
    let origin = env_config::trim_env_public("APP_ORIGIN")
        .unwrap_or_else(|| "http://localhost:5173".into())
        .trim_end_matches('/')
        .to_string();
    let base = env_config::trim_env_public("APP_BASE_PATH").unwrap_or_else(|| "/".into());
    let prefix = if base == "/" {
        "/".to_string()
    } else {
        format!("{}/", base.trim_end_matches('/'))
    };
    let mut query = format!("ok=0&error={}", pct_encode(code));
    if let Some(msg) = message.filter(|m| !m.is_empty()) {
        query.push_str("&message=");
        query.push_str(&pct_encode(&msg[..msg.len().min(200)]));
    }
    format!("{origin}{prefix}#/app/auth/oauth-callback?{query}")
}

fn default_oauth_redirect_uri() -> String {
    let origin = env_config::trim_env_public("APP_ORIGIN")
        .unwrap_or_else(|| "http://localhost:5173".into())
        .trim_end_matches('/')
        .to_string();
    let base = env_config::trim_env_public("APP_BASE_PATH").unwrap_or_else(|| "/".into());
    let prefix = if base == "/" {
        String::new()
    } else {
        base.trim_end_matches('/').to_string()
    };
    if prefix.is_empty() {
        format!("{origin}/oauth-return.html")
    } else {
        format!("{origin}/{prefix}/oauth-return.html")
    }
}

/// Public OAuth config for the SPA — mirrors Express `GET /api/auth/oauth/config`.
pub async fn oauth_config() -> Json<serde_json::Value> {
    let redirect_uri = env_config::trim_env_public("GOOGLE_OAUTH_REDIRECT_URI")
        .or_else(|| env_config::trim_env_public("LINKEDIN_OAUTH_REDIRECT_URI"))
        .unwrap_or_else(default_oauth_redirect_uri);

    let google_id = env_config::oauth_client_id_public("google");
    let linkedin_id = env_config::oauth_client_id_public("linkedin");
    let github_id = env_config::oauth_client_id_public("github");
    let apple_id = env_config::trim_env_public("APPLE_OAUTH_CLIENT_ID").unwrap_or_default();

    Json(json!({
        "ok": true,
        "redirectUri": redirect_uri,
        "authorizedJavascriptOrigins": [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "https://www.geosyntra.org",
            "https://geosyntra.org",
        ],
        "serverRedirect": env_config::trim_env_public("OAUTH_SERVER_REDIRECT")
            .map(|v| v == "1")
            .unwrap_or(false),
        "providers": {
            "google": env_config::is_oauth_provider_configured("google"),
            "linkedin": env_config::is_oauth_provider_configured("linkedin"),
            "github": env_config::is_oauth_provider_configured("github"),
            "apple": false,
        },
        "callbacks": {
            "google": env_config::resolve_oauth_callback_url("google"),
            "linkedin": env_config::resolve_oauth_callback_url("linkedin"),
            "github": env_config::resolve_oauth_callback_url("github"),
            "apple": env_config::resolve_oauth_callback_url("apple"),
        },
        "google": {
            "configured": env_config::is_oauth_provider_configured("google"),
            "clientId": google_id,
        },
        "linkedin": {
            "configured": env_config::is_oauth_provider_configured("linkedin"),
            "clientId": linkedin_id,
        },
        "apple": {
            "configured": !apple_id.is_empty(),
            "clientId": apple_id,
            "placeholder": true,
        },
        "github": {
            "configured": env_config::is_oauth_provider_configured("github"),
            "clientId": github_id,
        },
    }))
}

/// Email transport status — mirrors Express `GET /api/auth/email/status`.
pub async fn email_status() -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "configured": env_config::has_email_config(),
        "provider": env_config::email_provider_label(),
    }))
}

/// Sign in with Apple placeholder — mirrors Express `GET /api/auth/apple`.
pub async fn apple_oauth() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "ok": false,
            "error": "apple_oauth_placeholder",
            "message": "Sign in with Apple will be enabled in a future release.",
        })),
    )
}

pub async fn apple_oauth_callback() -> Redirect {
    Redirect::temporary(&spa_oauth_error_redirect("apple_oauth_placeholder", None))
}
