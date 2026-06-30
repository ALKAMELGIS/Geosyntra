//! Resolve resource tenant for multi-tenant authorization (H2-full).

use domain::{TenantId, UserId};

use crate::{
    error::{AppError, AppResult},
    ports::MembershipReadRepository,
    SubjectContext,
};

/// Resolve the tenant for a user mutation. Target users must belong to the subject tenant.
pub async fn resolve_resource_tenant(
    membership: &dyn MembershipReadRepository,
    ctx: &SubjectContext,
    target_user_id: Option<&UserId>,
) -> AppResult<TenantId> {
    if let Some(user_id) = target_user_id {
        return match membership
            .find_tenant_for_user(ctx.clone(), user_id.clone())
            .await?
        {
            Some(tenant) => Ok(tenant),
            None => Err(AppError::Forbidden),
        };
    }
    Ok(ctx.tenant_id().clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use crate::{
        authorization::access_descriptor::AccessControl,
        dto::tenant::view::MembershipView,
        projection::fields::membership::MembershipField,
    };
    use async_trait::async_trait;

    struct MockMembership {
        tenant: Option<TenantId>,
    }

    #[async_trait]
    impl MembershipReadRepository for MockMembership {
        async fn fetch_view_by_user_and_tenant(
            &self,
            _ctx: SubjectContext,
            _user_id: UserId,
            _tenant_id: TenantId,
            _access: &AccessControl<MembershipField>,
        ) -> crate::error::AppResult<MembershipView> {
            unimplemented!()
        }

        async fn fetch_views_by_tenant(
            &self,
            _ctx: SubjectContext,
            _tenant_id: TenantId,
            _access: &AccessControl<MembershipField>,
            _page: u32,
            _page_size: u32,
        ) -> crate::error::AppResult<Vec<MembershipView>> {
            unimplemented!()
        }

        async fn find_tenant_for_user(
            &self,
            _ctx: SubjectContext,
            _user_id: UserId,
        ) -> crate::error::AppResult<Option<TenantId>> {
            Ok(self.tenant.clone())
        }
    }

    fn ctx() -> SubjectContext {
        SubjectContext::new(
            UserId::new("1"),
            TenantId::new("geosyntra-default"),
            &[],
            &[],
        )
    }

    #[tokio::test]
    async fn uses_membership_tenant_when_present() {
        let repo = MockMembership {
            tenant: Some(TenantId::new("tenant-b")),
        };
        let subject = ctx();
        let resolved = resolve_resource_tenant(
            &repo,
            &subject,
            Some(&UserId::new("99")),
        )
        .await
        .unwrap();
        assert_eq!(resolved.as_str(), "tenant-b");
    }

    #[tokio::test]
    async fn denies_when_target_not_in_subject_tenant() {
        let repo = MockMembership { tenant: None };
        let subject = ctx();
        let err = resolve_resource_tenant(
            &repo,
            &subject,
            Some(&UserId::new("99")),
        )
        .await
        .expect_err("cross-tenant");
        assert!(matches!(err, AppError::Forbidden));
    }
}
