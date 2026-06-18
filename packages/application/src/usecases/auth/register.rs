use std::sync::Arc;

use crate::{
    dto::auth::RegisterCommand,
    error::AppResult,
    ports::AuthDirectoryRepository,
    usecases::usecase_descriptor::UseCaseDescriptor,
};

pub struct RegisterUseCase {
    auth_dir: Arc<dyn AuthDirectoryRepository>,
}

impl RegisterUseCase {
    pub fn new(auth_dir: Arc<dyn AuthDirectoryRepository>) -> Self {
        Self { auth_dir }
    }

    pub async fn execute(&self, command: RegisterCommand) -> AppResult<PublicUserOrPending> {
        let user = self.auth_dir.register(command).await?;
        Ok(PublicUserOrPending { user })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicUserOrPending {
    pub user: crate::dto::auth::PublicUserView,
}

impl UseCaseDescriptor for RegisterUseCase {
    const NAME: &'static str = "register";
    const RESOURCE: &'static str = "auth";
    const ACTION: &'static str = "register";
    const AUDIT: bool = true;
}
