pub mod audit;
pub mod governance;
pub mod grants;
pub mod memberships;
pub mod platform;
pub mod policies;
pub mod roles;
pub mod team;
pub mod tenants;
pub mod users;

use crate::{auth_session::AuthSession, error_display::ApiError};

pub fn bearer_token(session: &AuthSession) -> Result<String, ApiError> {
    session
        .bearer()
        .map(str::to_string)
        .ok_or_else(|| ApiError::Http {
            status: 401,
            message: "Sign in required".into(),
        })
}
