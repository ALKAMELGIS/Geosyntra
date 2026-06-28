//! Geo AI chat client — Axum `/api/ai/chat` (Task 31.10 / FD-8).

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    api::settings::config::fetch_config_status,
    api_client::ApiClient,
    error_display::ApiError,
};

#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    pub reply: String,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ChatRequest<'a> {
    message: &'a str,
    #[serde(rename = "modelProvider")]
    model_provider: &'a str,
}

const PROVIDER_PRIORITY: &[&str] = &["gemini", "openai", "claude", "deepseek"];

/// Pick first configured LLM provider from platform config; simulated when none.
pub async fn resolve_model_provider(token: Option<&str>) -> String {
    let Some(tok) = token.filter(|t| !t.is_empty()) else {
        return "simulated".into();
    };
    if let Ok(cfg) = fetch_config_status(tok).await {
        for id in PROVIDER_PRIORITY {
            if cfg
                .capabilities
                .get(*id)
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                return (*id).into();
            }
        }
    }
    "simulated".into()
}

/// Send a Geo AI message with auto-detected model provider.
pub async fn send_chat(message: &str, token: Option<&str>) -> Result<ChatResponse, ApiError> {
    let provider = resolve_model_provider(token).await;
    send_chat_with_provider(message, &provider, token).await
}

pub async fn send_chat_with_provider(
    message: &str,
    model_provider: &str,
    token: Option<&str>,
) -> Result<ChatResponse, ApiError> {
    let client = ApiClient::from_env();
    let body = json!(ChatRequest {
        message,
        model_provider,
    });
    client.post_json("/api/ai/chat", &body, token).await
}
