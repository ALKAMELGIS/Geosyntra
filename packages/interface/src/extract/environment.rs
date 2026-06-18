//! Request environment extraction (Task 12).

use application::authorization::neutral_environment;
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use domain::tenant::environment::Environment;

pub struct RequestEnvironment(pub Environment);

impl<S> FromRequestParts<S> for RequestEnvironment
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(_parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Until geo/IP headers are wired, use neutral environment (same as tests).
        Ok(Self(neutral_environment()))
    }
}
