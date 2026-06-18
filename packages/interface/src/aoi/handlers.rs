use application::error::AppError;
use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use chrono::Utc;
use domain::{DateTime, PermissionSlug};
use serde_json::{json, Value};

use crate::{
    aoi::store::{self, scope_key},
    error::AppErrorResponse,
    extract::AuthSubject,
};

fn now() -> DateTime {
    DateTime::new(Utc::now().timestamp())
}

fn require_read(ctx: &application::SubjectContext) -> Result<(), AppErrorResponse> {
    let slug = PermissionSlug::new("aoi.read").map_err(|e| AppError::Domain(e))?;
    if !ctx
        .has_permission_slug(&slug, &now())
        .map_err(AppError::Domain)?
    {
        return Err(AppError::Forbidden.into());
    }
    Ok(())
}

fn require_write(ctx: &application::SubjectContext) -> Result<(), AppErrorResponse> {
    let slug = PermissionSlug::new("aoi.write").map_err(|e| AppError::Domain(e))?;
    if !ctx
        .has_permission_slug(&slug, &now())
        .map_err(AppError::Domain)?
    {
        return Err(AppError::Forbidden.into());
    }
    Ok(())
}

fn validate_geometry(body: &Value) -> Result<(), AppErrorResponse> {
    let geometry = body.get("geometry").or_else(|| {
        if body.get("type").and_then(|v| v.as_str()) == Some("Feature") {
            body.get("geometry")
        } else {
            None
        }
    });
    if geometry.is_some() {
        return Ok(());
    }
    Err(AppErrorResponse::validation(
        "Invalid AOI data",
        StatusCode::BAD_REQUEST,
    ))
}

/// `GET /api/aoi` — tenant/user scoped AOI list (Express-compatible array body).
pub async fn list_aoi(AuthSubject(ctx): AuthSubject) -> Result<Json<Value>, AppErrorResponse> {
    require_read(&ctx)?;
    let scope = scope_key(ctx.tenant_id().as_str(), ctx.user_id().as_str());
    Ok(Json(Value::Array(store::list_for_scope(&scope))))
}

/// `POST /api/aoi` — create or update AOI geometry for the signed-in user.
pub async fn create_aoi(
    AuthSubject(ctx): AuthSubject,
    Json(body): Json<Value>,
) -> Result<Json<Value>, AppErrorResponse> {
    require_write(&ctx)?;
    validate_geometry(&body)?;
    let scope = scope_key(ctx.tenant_id().as_str(), ctx.user_id().as_str());
    Ok(Json(store::upsert(&scope, body)))
}

/// `DELETE /api/aoi/:id` — remove AOI by id within tenant/user scope.
pub async fn delete_aoi(
    AuthSubject(ctx): AuthSubject,
    Path(id): Path<String>,
) -> Result<Json<Value>, AppErrorResponse> {
    require_write(&ctx)?;
    let scope = scope_key(ctx.tenant_id().as_str(), ctx.user_id().as_str());
    if store::delete(&scope, id.trim()) {
        Ok(Json(json!({ "success": true })))
    } else {
        Err(AppErrorResponse::validation(
            "AOI not found",
            StatusCode::NOT_FOUND,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_geometry() {
        assert!(validate_geometry(&json!({ "name": "x" })).is_err());
    }
}
