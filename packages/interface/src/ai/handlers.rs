use axum::Json;
use serde_json::json;

/// Demo analyze endpoint — mirrors Express `POST /api/ai/analyze`.
pub async fn analyze() -> Json<serde_json::Value> {
    Json(json!({
        "score": 0.72,
        "advisories": ["Irrigate in 24h", "Apply NPK 10-10-10"],
    }))
}

/// AI chat stub — live OpenAI/DeepSeek deferred.
pub async fn chat(
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
    if !crate::config::token_configured("openai") && !crate::config::token_configured("deepseek") {
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
