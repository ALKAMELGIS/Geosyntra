use axum::Json;
use serde_json::json;

pub async fn weather_latest() -> Json<serde_json::Value> {
    Json(json!({
        "temp_c": 36.2,
        "humidity_pct": 42,
        "wind_ms": 3.2,
        "rainfall_mm": 0,
    }))
}
