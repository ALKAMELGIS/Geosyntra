use axum::{extract::State, Json};
use serde_json::json;

use crate::state::AppState;

/// Demo analyze endpoint — mirrors Express `POST /api/ai/analyze`.
pub async fn analyze() -> Json<serde_json::Value> {
    Json(json!({
        "score": 0.72,
        "advisories": ["Irrigate in 24h", "Apply NPK 10-10-10"],
    }))
}

/// AI chat stub — live OpenAI/DeepSeek deferred.
pub async fn chat(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, crate::error::AppErrorResponse> {
    use axum::http::StatusCode;

    let provider = body
        .get("modelProvider")
        .and_then(|v| v.as_str())
        .unwrap_or("openai");
    if provider == "simulated" {
        return Ok(Json(json!({
            "reply": "Simulated GeoAI response (Axum stub).",
            "model": "Geosyntra-Basic (Simulated)",
        })));
    }
    let openai = state.tokens.is_configured("openai").await?;
    let deepseek = state.tokens.is_configured("deepseek").await?;
    if !openai && !deepseek {
        return Err(crate::error::AppErrorResponse::validation(
            "ai_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(crate::error::AppErrorResponse::validation(
        "ai_chat_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}
