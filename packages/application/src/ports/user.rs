use domain::{Email, User, UserId, Username};

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::user::view::UserView,
    error::AppResult,
    ports::sort::UserSortBy,
    projection::fields::user::UserField,
    SubjectContext,
};

/// Read path — infra may scope SQL columns using `access`; application always re-applies projection.
#[async_trait::async_trait]
pub trait UserReadRepository: Send + Sync {
    async fn fetch_view_by_id(
        &self,
        ctx: SubjectContext,
        id: UserId,
        access: &AccessControl<UserField>,
    ) -> AppResult<UserView>;

    async fn fetch_view_by_email(
        &self,
        ctx: SubjectContext,
        email: Email,
        access: &AccessControl<UserField>,
    ) -> AppResult<UserView>;

    async fn fetch_view_by_username(
        &self,
        ctx: SubjectContext,
        username: Username,
        access: &AccessControl<UserField>,
    ) -> AppResult<UserView>;

    async fn fetch_views_paginated(
        &self,
        ctx: SubjectContext,
        access: &AccessControl<UserField>,
        sort_by: &[UserSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<UserView>>;

    /// Resolve user id for self-read authorization (M3) without loading full view.
    async fn find_user_id_by_email(
        &self,
        _ctx: SubjectContext,
        _email: Email,
    ) -> AppResult<Option<UserId>> {
        Ok(None)
    }

    async fn find_user_id_by_username(
        &self,
        _ctx: SubjectContext,
        _username: Username,
    ) -> AppResult<Option<UserId>> {
        Ok(None)
    }
}

/// Write path — loads/saves domain aggregates.
#[async_trait::async_trait]
pub trait UserWriteRepository: Send + Sync {
    async fn get_for_update(&self, ctx: SubjectContext, id: UserId) -> AppResult<User>;
    async fn insert(
        &self,
        ctx: SubjectContext,
        user: User,
        role_display: Option<String>,
    ) -> AppResult<()>;
    /// Updates `admin_users.role` display label (Express `setUserRole` parity).
    async fn update_directory_role(
        &self,
        _ctx: SubjectContext,
        user_id: UserId,
        role_display: String,
    ) -> AppResult<()> {
        let _ = (user_id, role_display);
        Err(crate::error::AppError::Unknown(
            "update_directory_role not implemented".into(),
        ))
    }
    async fn save(&self, ctx: SubjectContext, user: User) -> AppResult<()>;
    async fn delete_by_id(&self, ctx: SubjectContext, id: UserId) -> AppResult<bool>;
}

#[async_trait::async_trait]
pub trait UserRepository: UserReadRepository + UserWriteRepository {}

/// Allocates database-backed user ids (risk H3).
#[async_trait::async_trait]
pub trait UserIdAllocator: Send + Sync {
    async fn allocate(&self) -> AppResult<UserId>;
}
