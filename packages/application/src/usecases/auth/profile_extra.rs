use std::sync::Arc;

use domain::Email;
use serde_json::Value;

use crate::{
    error::{AppError, AppResult},
    ports::AuthLifecycleRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct GetProfileExtraUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
}

impl GetProfileExtraUseCase {
    pub fn new(lifecycle: Arc<dyn AuthLifecycleRepository>) -> Self {
        Self { lifecycle }
    }

    pub async fn execute(&self, email: &Email) -> AppResult<Value> {
        self.lifecycle.get_profile_extra(email).await
    }
}

impl UseCaseDescriptor for GetProfileExtraUseCase {
    const NAME: &'static str = "get_profile_extra";
    const RESOURCE: &'static str = "account";
    const ACTION: &'static str = "read";
    const AUDIT: bool = false;
}

pub struct PutProfileExtraUseCase {
    lifecycle: Arc<dyn AuthLifecycleRepository>,
}

impl PutProfileExtraUseCase {
    pub fn new(lifecycle: Arc<dyn AuthLifecycleRepository>) -> Self {
        Self { lifecycle }
    }

    pub async fn execute(&self, email: &Email, patch: Value) -> AppResult<Value> {
        if !patch.is_object() {
            return Err(AppError::ValidationError("profile_required".into()));
        }
        self.lifecycle.put_profile_extra(email, patch).await
    }
}

impl UseCaseDescriptor for PutProfileExtraUseCase {
    const NAME: &'static str = "put_profile_extra";
    const RESOURCE: &'static str = "account";
    const ACTION: &'static str = "write";
    const AUDIT: bool = true;
}
