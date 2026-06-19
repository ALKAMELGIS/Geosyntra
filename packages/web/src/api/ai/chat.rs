//! Geo AI chat client — Axum `/api/ai/chat` (Task 31.10).

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

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

/// Send a Geo AI message. Uses simulated provider when live keys are unavailable.
pub async fn send_chat(message: &str, token: Option<&str>) -> Result<ChatResponse, ApiError> {
    let client = ApiClient::from_env();
    let body = json!(ChatRequest {
        message,
        model_provider: "simulated",
    });
    client.post_json("/api/ai/chat", &body, token).await
}
