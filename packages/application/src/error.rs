use domain::error::DomainError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Domain validation failed: {0}")]
    Domain(#[from] DomainError),

    #[error("Repository failed: {0}")]
    Repository(String),

    #[error("Permission denied")]
    Forbidden,

    #[error("Application Validation failed: {0}")]
    ValidationError(String),

    #[error("Application Policy failed: {0}")]
    PolicyError(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Unknown application error: {0}")]
    Unknown(String),
}

pub type AppResult<T> = Result<T, AppError>;
