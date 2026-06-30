use axum::{http::StatusCode, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppErrorResponse;

#[derive(Debug, Deserialize)]
pub struct ClientLogRequest {
    pub event: Option<String>,
    pub at: Option<String>,
    pub page: Option<String>,
    pub details: Option<Value>,
}

pub async fn client_log(
    Json(body): Json<ClientLogRequest>,
) -> Result<(StatusCode, Json<Value>), AppErrorResponse> {
    let event = body.event.as_deref().unwrap_or("").trim();
    if event.is_empty() {
        return Err(AppErrorResponse::validation(
            "event is required",
            StatusCode::BAD_REQUEST,
        ));
    }
    let _ = (body.at, body.page, body.details);
    Ok((StatusCode::CREATED, Json(json!({ "success": true }))))
}
