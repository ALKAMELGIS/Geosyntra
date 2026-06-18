//! JWT → [`SubjectContext`] extractor (Task 12).

use application::{error::AppError, SubjectContext};
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header::AUTHORIZATION, request::Parts},
};

use crate::{error::AppErrorResponse, state::AppState};

pub struct AuthSubject(pub SubjectContext);

impl<S> FromRequestParts<S> for AuthSubject
where
    S: Send + Sync,
    AppState: axum::extract::FromRef<S>,
{
    type Rejection = AppErrorResponse;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app = AppState::from_ref(state);
        let header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::ValidationError("missing_authorization".into()))?;
        let ctx = app
            .subject_resolver
            .resolve(header)
            .await
            .map_err(AppErrorResponse::from)?;
        app.policy_reload
            .ensure_loaded(&ctx)
            .await
            .map_err(AppErrorResponse::from)?;
        Ok(Self(ctx))
    }
}
