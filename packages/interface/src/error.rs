//! HTTP error mapping — mirrors Express JSON error shape.

use application::error::AppError;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: String,
    pub code: String,
}

pub struct AppErrorResponse {
    status: StatusCode,
    body: ErrorBody,
}

impl AppErrorResponse {
    pub fn from_app_error(err: AppError) -> Self {
        let (status, code) = match &err {
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::ValidationError(_) => (StatusCode::BAD_REQUEST, "validation_error"),
            AppError::PolicyError(_) => (StatusCode::FORBIDDEN, "policy_error"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::Domain(_) => (StatusCode::BAD_REQUEST, "domain_error"),
            AppError::Repository(_) => (StatusCode::INTERNAL_SERVER_ERROR, "repository_error"),
            AppError::Unknown(_) => (StatusCode::INTERNAL_SERVER_ERROR, "unknown_error"),
        };
        Self {
            status,
            body: ErrorBody {
                error: err.to_string(),
                code: code.into(),
            },
        }
    }

    /// Express-style `{ ok: false, error: code }` with explicit HTTP status.
    pub fn validation(error: impl Into<String>, status: StatusCode) -> Self {
        let error = error.into();
        Self {
            status,
            body: ErrorBody {
                error: error.clone(),
                code: error,
            },
        }
    }
}

impl IntoResponse for AppErrorResponse {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

impl From<AppError> for AppErrorResponse {
    fn from(value: AppError) -> Self {
        Self::from_app_error(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use application::error::AppError;

    #[test]
    fn maps_forbidden_to_403() {
        let resp = AppErrorResponse::from_app_error(AppError::Forbidden);
        assert_eq!(resp.status, StatusCode::FORBIDDEN);
        assert_eq!(resp.body.code, "forbidden");
    }

    #[test]
    fn maps_validation_to_400() {
        let resp = AppErrorResponse::from_app_error(AppError::ValidationError("bad".into()));
        assert_eq!(resp.status, StatusCode::BAD_REQUEST);
    }
}
