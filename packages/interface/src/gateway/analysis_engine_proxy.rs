//! Reverse-proxy analysis_engine `/mpc/*` — Express `registerAnalysisEngineProxy.js`.

use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::error::AppErrorResponse;

fn analysis_engine_base() -> String {
    std::env::var("ANALYSIS_ENGINE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8000".into())
        .trim_end_matches('/')
        .to_string()
}

pub async fn analysis_engine_proxy(req: Request) -> Result<Response, AppErrorResponse> {
    let base = analysis_engine_base();
    let path = req.uri().path();
    let suffix = path
        .strip_prefix("/api/analysis-engine")
        .unwrap_or(path);
    let query = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let target = format!("{base}{suffix}{query}");

    let method = req.method().clone();
    let headers = req.headers().clone();
    let body_bytes = axum::body::to_bytes(req.into_body(), 32 * 1024 * 1024)
        .await
        .map_err(|e| AppErrorResponse::validation(
            &format!("analysis_engine_body: {e}"),
            StatusCode::BAD_REQUEST,
        ))?;

    let client = reqwest::Client::new();
    let mut upstream = client.request(
        method,
        &target,
    );

    if let Some(ct) = headers.get(header::CONTENT_TYPE) {
        upstream = upstream.header(header::CONTENT_TYPE, ct);
    }
    if let Some(accept) = headers.get(header::ACCEPT) {
        upstream = upstream.header(header::ACCEPT, accept);
    } else {
        upstream = upstream.header(header::ACCEPT, "application/json");
    }

    if !body_bytes.is_empty() {
        upstream = upstream.body(body_bytes.to_vec());
    }

    let resp = upstream.send().await.map_err(|e| {
        AppErrorResponse::validation(
            &format!("analysis_engine_unreachable: {e}"),
            StatusCode::BAD_GATEWAY,
        )
    })?;

    let status = resp.status();
    let ct = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json");
    let bytes = resp.bytes().await.map_err(|e| {
        AppErrorResponse::validation(
            &format!("analysis_engine_read: {e}"),
            StatusCode::BAD_GATEWAY,
        )
    })?;

    Ok(Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, ct)
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

/// GET health probe for analysis engine (optional).
pub async fn analysis_engine_health() -> impl IntoResponse {
    let base = analysis_engine_base();
    let client = reqwest::Client::new();
    let ok = client
        .get(format!("{base}/mpc/templates"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    axum::Json(json!({
        "ok": ok,
        "baseUrl": base,
    }))
}
