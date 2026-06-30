//! GIS external tables + relationships — Express parity (Task 32.0).

use axum::{
    extract::{Path, Query},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::{error::AppErrorResponse, gis::store};

#[derive(Debug, Deserialize)]
pub struct RowsQuery {
    pub field: Option<String>,
    pub value: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    50
}

fn map_store_error(err: &'static str) -> AppErrorResponse {
    match err {
        "Table not found" | "Row not found" | "Relationship not found" => {
            AppErrorResponse::validation(err, StatusCode::NOT_FOUND)
        }
        "Unknown field" => AppErrorResponse::validation(err, StatusCode::BAD_REQUEST),
        "Missing primary key" => AppErrorResponse::validation(
            &format!("Missing primary key"),
            StatusCode::BAD_REQUEST,
        ),
        "Row already exists" => AppErrorResponse::validation(err, StatusCode::CONFLICT),
        "Relationship conflict" => AppErrorResponse::validation(
            "Relationship conflict: already exists for this layer/table/type.",
            StatusCode::CONFLICT,
        ),
        "Target table not found" | "Target key field not found" => {
            AppErrorResponse::validation(err, StatusCode::BAD_REQUEST)
        }
        "Validation failed" => {
            AppErrorResponse::validation("Validation failed", StatusCode::BAD_REQUEST)
        }
        _ => AppErrorResponse::validation(err, StatusCode::BAD_REQUEST),
    }
}

pub async fn list_external_tables() -> Json<Value> {
    Json(Value::Array(store::list_external_tables()))
}

pub async fn get_table_schema(Path(table): Path<String>) -> Result<Json<Value>, AppErrorResponse> {
    store::table_schema(&table)
        .map(Json)
        .ok_or_else(|| map_store_error("Table not found"))
}

pub async fn list_table_rows(
    Path(table): Path<String>,
    Query(q): Query<RowsQuery>,
) -> Result<Json<Value>, AppErrorResponse> {
    store::list_table_rows(
        &table,
        q.field.as_deref(),
        q.value.as_deref(),
        q.limit,
        q.offset,
    )
    .map(Json)
    .map_err(map_store_error)
}

pub async fn create_table_row(
    Path(table): Path<String>,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), AppErrorResponse> {
    let map = value_to_map(body)?;
    store::create_table_row(&table, map)
        .map(|v| (StatusCode::CREATED, Json(v)))
        .map_err(map_store_error)
}

pub async fn update_table_row(
    Path((table, row_id)): Path<(String, String)>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    let map = value_to_map(body)?;
    store::update_table_row(&table, &row_id, map)
        .map(Json)
        .map_err(map_store_error)
}

pub async fn delete_table_row(
    Path((table, row_id)): Path<(String, String)>,
) -> Result<Json<Value>, AppErrorResponse> {
    store::delete_table_row(&table, &row_id)
        .map(Json)
        .map_err(map_store_error)
}

pub async fn list_relationships() -> Json<Value> {
    Json(Value::Array(store::list_relationships()))
}

pub async fn create_relationship(Json(body): Json<Value>) -> Result<(StatusCode, Json<Value>), AppErrorResponse> {
    store::create_relationship(body)
        .map(|v| (StatusCode::CREATED, Json(v)))
        .map_err(map_store_error)
}

pub async fn update_relationship(
    Path(id): Path<String>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    store::update_relationship(&id, body)
        .map(Json)
        .map_err(map_store_error)
}

pub async fn delete_relationship(Path(id): Path<String>) -> Result<Json<Value>, AppErrorResponse> {
    store::delete_relationship(&id)
        .map(Json)
        .map_err(map_store_error)
}

#[derive(Debug, Deserialize)]
pub struct ResolveBody {
    #[serde(rename = "sourceLayerName")]
    pub source_layer_name: Option<String>,
    pub feature: Option<Value>,
}

pub async fn resolve_relationships(Json(body): Json<ResolveBody>) -> Result<Json<Value>, AppErrorResponse> {
    let source = body
        .source_layer_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppErrorResponse::validation("sourceLayerName is required", StatusCode::BAD_REQUEST))?;
    let feature = body.feature.ok_or_else(|| {
        AppErrorResponse::validation("feature is required", StatusCode::BAD_REQUEST)
    })?;
    Ok(Json(store::resolve_relationships(source, &feature)))
}

#[derive(Debug, Deserialize)]
pub struct DbTestBody {
    #[serde(rename = "type")]
    pub db_type: Option<String>,
    pub host: Option<String>,
    pub port: Option<String>,
    pub database: Option<String>,
    pub user: Option<String>,
}

pub async fn test_db_connection(Json(body): Json<DbTestBody>) -> Result<Json<Value>, AppErrorResponse> {
    let db_type = body.db_type.as_deref().unwrap_or("").trim().to_ascii_lowercase();
    if !["postgis", "sqlserver", "oracle"].contains(&db_type.as_str()) {
        return Err(AppErrorResponse::validation(
            "Unsupported database type",
            StatusCode::BAD_REQUEST,
        ));
    }
    let host = body.host.as_deref().unwrap_or("").trim();
    let database = body.database.as_deref().unwrap_or("").trim();
    let user = body.user.as_deref().unwrap_or("").trim();
    if host.is_empty() {
        return Err(AppErrorResponse::validation("Host is required", StatusCode::BAD_REQUEST));
    }
    if database.is_empty() {
        return Err(AppErrorResponse::validation("Database is required", StatusCode::BAD_REQUEST));
    }
    if user.is_empty() {
        return Err(AppErrorResponse::validation("User is required", StatusCode::BAD_REQUEST));
    }
    if let Some(port) = body.port.as_deref().filter(|p| !p.is_empty()) {
        if port.parse::<u16>().is_err() {
            return Err(AppErrorResponse::validation(
                "Port must be a number",
                StatusCode::BAD_REQUEST,
            ));
        }
    }
    let fail = host.to_ascii_lowercase().contains("fail")
        || database.to_ascii_lowercase().contains("fail")
        || user.to_ascii_lowercase().contains("fail");
    let latency = 80 + (chrono::Utc::now().timestamp_millis() % 180) as i64;
    if fail {
        return Err(AppErrorResponse::validation(
            "Connection failed (simulated). Check host/port/firewall and credentials.",
            StatusCode::SERVICE_UNAVAILABLE,
        ));
    }
    Ok(Json(json!({
        "success": true,
        "type": db_type,
        "latencyMs": latency,
    })))
}

fn value_to_map(value: Value) -> Result<Map<String, Value>, AppErrorResponse> {
    match value {
        Value::Object(map) => Ok(map),
        _ => Err(AppErrorResponse::validation(
            "Expected JSON object body",
            StatusCode::BAD_REQUEST,
        )),
    }
}
