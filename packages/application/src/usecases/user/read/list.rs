use std::sync::Arc;

use domain::tenant::environment::Environment;

use crate::{
    authorization::{
        authorize_use_case, field_access::FieldAccessResolver, AuthorizationParams,
        ports::AuthorizationService,
    },
    dto::user::view::UserView,
    error::AppResult,
    ports::{sort::UserSortBy, UserRepository},
    projection::UserProjector,
    usecases::{field_sets::readable_user_fields, usecase_descriptor::UseCaseDescriptor},
    SubjectContext,
};

pub struct ListUserUseCase {
    repo: Arc<dyn UserRepository>,
    auth: Arc<dyn AuthorizationService>,
}

impl ListUserUseCase {
    pub fn new(repo: Arc<dyn UserRepository>, auth: Arc<dyn AuthorizationService>) -> Self {
        Self { repo, auth }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        sort_by: &[UserSortBy],
        page: u32,
        page_size: u32,
    ) -> AppResult<Vec<UserView>> {
        let params = AuthorizationParams::new(&ctx, environment.clone())
            .with_resource_tenant_id(ctx.tenant_id());
        let decision = authorize_use_case::<Self>(self.auth.as_ref(), &params)?;
        let list_access = FieldAccessResolver::resolve(
            decision,
            readable_user_fields(&ctx, &environment, Self::RESOURCE, Self::ACTION, None),
        )?;
        let rows = self
            .repo
            .fetch_views_paginated(ctx.clone(), &list_access, sort_by, page, page_size)
            .await?;
        Ok(rows
            .into_iter()
            .map(|view| {
                let row_fields = readable_user_fields(
                    &ctx,
                    &environment,
                    Self::RESOURCE,
                    Self::ACTION,
                    view.id.as_ref(),
                );
                let row_access = FieldAccessResolver::resolve(decision, row_fields).unwrap_or(list_access.clone());
                UserProjector::present(view, &row_access)
            })
            .collect())
    }
}

impl UseCaseDescriptor for ListUserUseCase {
    const NAME: &'static str = "list_user";
    const RESOURCE: &'static str = "user";
    const ACTION: &'static str = "list";
}
