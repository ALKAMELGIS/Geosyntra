use application::error::AppError;

pub type InfraResult<T> = Result<T, application::error::AppError>;

pub fn map_sqlx(err: sqlx::Error) -> AppError {
    match err {
        sqlx::Error::RowNotFound => AppError::ValidationError("not_found".into()),
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
            AppError::ValidationError("conflict".into())
        }
        other => AppError::Repository(other.to_string()),
    }
}

pub fn map_migrate(err: sqlx::migrate::MigrateError) -> AppError {
    AppError::Repository(err.to_string())
}
