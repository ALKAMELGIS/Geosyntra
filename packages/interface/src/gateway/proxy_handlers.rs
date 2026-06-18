use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::Value;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

/// OpenRouteService authenticated proxy — upstream fetch deferred.
pub async fn openrouteservice_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(_path): Path<String>,
    Json(_body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !state.tokens.is_configured("openrouteservice").await? {
        return Err(AppErrorResponse::validation(
            "ors_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(AppErrorResponse::validation(
        "ors_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

/// GraphHopper authenticated GET proxy — upstream fetch deferred.
pub async fn graphhopper_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(_path): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !state.tokens.is_configured("graphhopper").await? {
        return Err(AppErrorResponse::validation(
            "graphhopper_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(AppErrorResponse::validation(
        "graphhopper_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}

/// OpenWeatherMap authenticated GET proxy — upstream fetch deferred.
pub async fn openweathermap_proxy(
    State(state): State<AppState>,
    AuthSubject(_ctx): AuthSubject,
    RequestEnvironment(_env): RequestEnvironment,
    Path(_path): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    if !state.tokens.is_configured("openweathermap").await? {
        return Err(AppErrorResponse::validation(
            "openweathermap_not_configured",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Err(AppErrorResponse::validation(
        "openweathermap_proxy_not_implemented",
        StatusCode::NOT_IMPLEMENTED,
    ))
}
