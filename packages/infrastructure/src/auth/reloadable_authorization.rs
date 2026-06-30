use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use application::{
    authorization::{
        engine::{AuthorizationContext, AuthorizationEngine},
        policys::ApplicationStoredPolicy,
        ports::AuthorizationService,
        AccessDecision,
    },
    error::AppResult,
    ports::{AuthCache, CachedTenantPolicies, PolicyReloadService, PolicyRepository},
    SubjectContext,
};
use async_trait::async_trait;

use crate::cache::policy_ttl;

pub fn policy_fingerprint(policies: &[ApplicationStoredPolicy]) -> String {
    let mut ids: Vec<_> = policies.iter().map(|p| p.id.as_str()).collect();
    ids.sort_unstable();
    format!("{}:{}", policies.len(), ids.join(","))
}

/// Authorization engine with per-tenant stored-policy reload (Task 15 M4).
pub struct ReloadableAuthorizationService {
    engine: RwLock<AuthorizationEngine>,
    policy_repo: Arc<dyn PolicyRepository>,
    auth_cache: Arc<dyn AuthCache>,
    local_fp: RwLock<HashMap<String, String>>,
}

impl ReloadableAuthorizationService {
    pub fn new(
        policy_repo: Arc<dyn PolicyRepository>,
        initial_policies: Vec<ApplicationStoredPolicy>,
        auth_cache: Arc<dyn AuthCache>,
    ) -> Arc<Self> {
        Arc::new(Self {
            engine: RwLock::new(AuthorizationEngine::with_stored_policies(initial_policies)),
            policy_repo,
            auth_cache,
            local_fp: RwLock::new(HashMap::new()),
        })
    }

    async fn apply_policies(&self, tenant: &str, policies: Vec<ApplicationStoredPolicy>) {
        let fingerprint = policy_fingerprint(&policies);
        self.engine
            .write()
            .expect("auth engine lock")
            .replace_stored_policies(policies);
        self.local_fp
            .write()
            .expect("policy cache lock")
            .insert(tenant.to_string(), fingerprint);
    }

    async fn load_and_apply(&self, ctx: &SubjectContext) -> AppResult<()> {
        let tenant = ctx.tenant_id().as_str();

        if let Some(cached) = self.auth_cache.get_tenant_policies(tenant).await {
            let skip = {
                self.local_fp
                    .read()
                    .expect("policy cache lock")
                    .get(tenant)
                    .is_some_and(|fp| fp == &cached.fingerprint)
            };
            if skip {
                return Ok(());
            }
            self.apply_policies(tenant, cached.policies).await;
            return Ok(());
        }

        let policies = self.policy_repo.load_active_policies(ctx).await?;
        let fingerprint = policy_fingerprint(&policies);

        let local_hit = {
            self.local_fp
                .read()
                .expect("policy cache lock")
                .get(tenant)
                .is_some_and(|fp| fp == &fingerprint)
        };
        if local_hit {
            self.auth_cache
                .set_tenant_policies(
                    tenant,
                    &CachedTenantPolicies {
                        fingerprint,
                        policies: policies.clone(),
                    },
                    policy_ttl(),
                )
                .await;
            return Ok(());
        }

        self.auth_cache
            .set_tenant_policies(
                tenant,
                &CachedTenantPolicies {
                    fingerprint: fingerprint.clone(),
                    policies: policies.clone(),
                },
                policy_ttl(),
            )
            .await;
        self.apply_policies(tenant, policies).await;
        Ok(())
    }
}

impl AuthorizationService for ReloadableAuthorizationService {
    fn authorize(&self, ctx: &AuthorizationContext) -> AccessDecision {
        self.engine
            .read()
            .expect("auth engine lock")
            .evaluate(ctx)
    }
}

#[async_trait]
impl PolicyReloadService for ReloadableAuthorizationService {
    async fn ensure_loaded(&self, ctx: &SubjectContext) -> AppResult<()> {
        self.load_and_apply(ctx).await
    }

    async fn invalidate_tenant(&self, ctx: &SubjectContext) -> AppResult<()> {
        let tenant = ctx.tenant_id().as_str();
        self.local_fp
            .write()
            .expect("policy cache lock")
            .remove(tenant);
        self.auth_cache.invalidate_tenant(tenant).await;
        self.load_and_apply(ctx).await
    }
}

#[cfg(test)]
mod tests {
    use application::{
        authorization::{
            action::AuthorizationAction,
            attributes::AuthorizationAttributes,
            engine::AuthorizationContext,
            policys::{
                ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
                ApplicationStoredPolicy,
            },
            relation::AuthorizationRelations,
            resource_type::AuthorizationResourceType,
            AccessDecision,
        },
        SubjectContext,
    };
    use domain::TenantId;
    use domain::UserId;

    use super::*;
    use application::authorization::authorize::neutral_environment;
    use application::ports::NoopAuthCache;

    struct StaticPolicyRepo {
        policies: Vec<ApplicationStoredPolicy>,
    }

    #[async_trait]
    impl PolicyRepository for StaticPolicyRepo {
        async fn list_versions(
            &self,
            _ctx: SubjectContext,
        ) -> application::error::AppResult<Vec<application::dto::policy::PolicyVersionSummaryView>>
        {
            Ok(vec![])
        }

        async fn fetch_version(
            &self,
            _ctx: SubjectContext,
            _id: application::dto::policy::PolicyVersionId,
        ) -> application::error::AppResult<application::dto::policy::PolicyVersionView> {
            Err(application::error::AppError::ValidationError(
                "not_implemented".into(),
            ))
        }

        async fn create_version(
            &self,
            _ctx: SubjectContext,
            _command: application::dto::policy::CreatePolicyVersionCommand,
        ) -> application::error::AppResult<application::dto::policy::PolicyVersionId> {
            Err(application::error::AppError::ValidationError(
                "not_implemented".into(),
            ))
        }

        async fn update_version(
            &self,
            _ctx: SubjectContext,
            _id: application::dto::policy::PolicyVersionId,
            _command: application::dto::policy::UpdatePolicyVersionCommand,
        ) -> application::error::AppResult<()> {
            Err(application::error::AppError::ValidationError(
                "not_implemented".into(),
            ))
        }

        async fn delete_version(
            &self,
            _ctx: SubjectContext,
            _id: application::dto::policy::PolicyVersionId,
        ) -> application::error::AppResult<bool> {
            Ok(false)
        }

        async fn activate_version(
            &self,
            _ctx: SubjectContext,
            _id: application::dto::policy::PolicyVersionId,
            _command: application::dto::policy::ActivatePolicyVersionCommand,
        ) -> application::error::AppResult<()> {
            Ok(())
        }

        async fn load_active_policies(
            &self,
            _ctx: &SubjectContext,
        ) -> application::error::AppResult<Vec<ApplicationStoredPolicy>> {
            Ok(self.policies.clone())
        }
    }

    fn allow_user_read_policy() -> ApplicationStoredPolicy {
        let mut builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new("allow-user-read"),
            ApplicationPolicyPriority::new(100),
        );
        builder
            .set_resource_type(AuthorizationResourceType::new("user"))
            .set_action(AuthorizationAction::new("read"))
            .set_effect(ApplicationPolicyEffect::Allow);
        builder.build().unwrap()
    }

    fn auth_ctx(subject: &SubjectContext) -> AuthorizationContext<'_> {
        AuthorizationContext {
            subject,
            action: AuthorizationAction::new("read"),
            resource_type: AuthorizationResourceType::new("user"),
            subject_attributes: AuthorizationAttributes::new(),
            resource_attributes: AuthorizationAttributes::new(),
            relations: AuthorizationRelations::new(),
            environment: neutral_environment(),
        }
    }

    #[tokio::test]
    async fn reload_applies_stored_policies_for_tenant() {
        let policy = allow_user_read_policy();
        let repo = Arc::new(StaticPolicyRepo {
            policies: vec![policy],
        });
        let service =
            ReloadableAuthorizationService::new(repo, vec![], Arc::new(NoopAuthCache));
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[],
        );
        service.ensure_loaded(&ctx).await.unwrap();
        let decision = service.authorize(&auth_ctx(&ctx));
        assert!(matches!(decision, AccessDecision::Allow));
    }

    struct InMemoryAuthCache {
        policies: std::sync::Mutex<std::collections::HashMap<String, CachedTenantPolicies>>,
        load_calls: std::sync::atomic::AtomicUsize,
    }

    #[async_trait]
    impl AuthCache for InMemoryAuthCache {
        async fn get_membership_role_ids(
            &self,
            _: &str,
            _: &str,
        ) -> Option<Vec<String>> {
            None
        }
        async fn set_membership_role_ids(
            &self,
            _: &str,
            _: &str,
            _: &[String],
            _: std::time::Duration,
        ) {
        }
        async fn get_role_permission_slugs(&self, _: &str) -> Option<Vec<String>> {
            None
        }
        async fn set_role_permission_slugs(
            &self,
            _: &str,
            _: &[String],
            _: std::time::Duration,
        ) {
        }
        async fn get_tenant_policies(&self, tenant_id: &str) -> Option<CachedTenantPolicies> {
            self.load_calls
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.policies.lock().unwrap().get(tenant_id).cloned()
        }
        async fn set_tenant_policies(
            &self,
            tenant_id: &str,
            data: &CachedTenantPolicies,
            _: std::time::Duration,
        ) {
            self.policies
                .lock()
                .unwrap()
                .insert(tenant_id.to_string(), data.clone());
        }
        async fn invalidate_user(&self, _: &str) {}
        async fn invalidate_tenant(&self, tenant_id: &str) {
            self.policies.lock().unwrap().remove(tenant_id);
        }
    }

    struct PanicPolicyRepo;

    #[async_trait]
    impl PolicyRepository for PanicPolicyRepo {
        async fn list_versions(
            &self,
            _: SubjectContext,
        ) -> application::error::AppResult<
            Vec<application::dto::policy::PolicyVersionSummaryView>,
        > {
            unimplemented!()
        }
        async fn fetch_version(
            &self,
            _: SubjectContext,
            _: application::dto::policy::PolicyVersionId,
        ) -> application::error::AppResult<application::dto::policy::PolicyVersionView> {
            unimplemented!()
        }
        async fn create_version(
            &self,
            _: SubjectContext,
            _: application::dto::policy::CreatePolicyVersionCommand,
        ) -> application::error::AppResult<application::dto::policy::PolicyVersionId> {
            unimplemented!()
        }
        async fn update_version(
            &self,
            _: SubjectContext,
            _: application::dto::policy::PolicyVersionId,
            _: application::dto::policy::UpdatePolicyVersionCommand,
        ) -> application::error::AppResult<()> {
            unimplemented!()
        }
        async fn delete_version(
            &self,
            _: SubjectContext,
            _: application::dto::policy::PolicyVersionId,
        ) -> application::error::AppResult<bool> {
            Ok(false)
        }
        async fn activate_version(
            &self,
            _: SubjectContext,
            _: application::dto::policy::PolicyVersionId,
            _: application::dto::policy::ActivatePolicyVersionCommand,
        ) -> application::error::AppResult<()> {
            Ok(())
        }
        async fn load_active_policies(
            &self,
            _: &SubjectContext,
        ) -> application::error::AppResult<Vec<ApplicationStoredPolicy>> {
            panic!("load_active_policies should not run on cache hit");
        }
    }

    #[tokio::test]
    async fn redis_cache_hit_skips_policy_repo_load() {
        let policy = allow_user_read_policy();
        let fp = super::policy_fingerprint(std::slice::from_ref(&policy));
        let cache = Arc::new(InMemoryAuthCache {
            policies: std::sync::Mutex::new(std::collections::HashMap::from([(
                "t1".to_string(),
                CachedTenantPolicies {
                    fingerprint: fp,
                    policies: vec![policy],
                },
            )])),
            load_calls: std::sync::atomic::AtomicUsize::new(0),
        });
        let service = ReloadableAuthorizationService::new(
            Arc::new(PanicPolicyRepo),
            vec![],
            cache.clone(),
        );
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[],
        );
        service.ensure_loaded(&ctx).await.unwrap();
        assert!(matches!(
            service.authorize(&auth_ctx(&ctx)),
            AccessDecision::Allow
        ));
        service.ensure_loaded(&ctx).await.unwrap();
        assert_eq!(
            cache.load_calls.load(std::sync::atomic::Ordering::SeqCst),
            2
        );
    }

    #[tokio::test]
    async fn invalidate_tenant_invokes_cache_invalidation() {
        struct InvalidateCountingCache {
            inner: InMemoryAuthCache,
            invalidations: std::sync::atomic::AtomicUsize,
        }

        #[async_trait]
        impl AuthCache for InvalidateCountingCache {
            async fn get_membership_role_ids(
                &self,
                u: &str,
                t: &str,
            ) -> Option<Vec<String>> {
                self.inner.get_membership_role_ids(u, t).await
            }
            async fn set_membership_role_ids(
                &self,
                u: &str,
                t: &str,
                r: &[String],
                ttl: std::time::Duration,
            ) {
                self.inner.set_membership_role_ids(u, t, r, ttl).await
            }
            async fn get_role_permission_slugs(&self, role_id: &str) -> Option<Vec<String>> {
                self.inner.get_role_permission_slugs(role_id).await
            }
            async fn set_role_permission_slugs(
                &self,
                role_id: &str,
                slugs: &[String],
                ttl: std::time::Duration,
            ) {
                self.inner
                    .set_role_permission_slugs(role_id, slugs, ttl)
                    .await
            }
            async fn get_tenant_policies(&self, tenant_id: &str) -> Option<CachedTenantPolicies> {
                self.inner.get_tenant_policies(tenant_id).await
            }
            async fn set_tenant_policies(
                &self,
                tenant_id: &str,
                data: &CachedTenantPolicies,
                ttl: std::time::Duration,
            ) {
                self.inner
                    .set_tenant_policies(tenant_id, data, ttl)
                    .await
            }
            async fn invalidate_user(&self, user_id: &str) {
                self.inner.invalidate_user(user_id).await
            }
            async fn invalidate_tenant(&self, tenant_id: &str) {
                self.invalidations
                    .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                self.inner.invalidate_tenant(tenant_id).await
            }
        }

        let policy = allow_user_read_policy();
        let fp = super::policy_fingerprint(std::slice::from_ref(&policy));
        let inner = InMemoryAuthCache {
            policies: std::sync::Mutex::new(std::collections::HashMap::from([(
                "t1".to_string(),
                CachedTenantPolicies {
                    fingerprint: fp,
                    policies: vec![policy.clone()],
                },
            )])),
            load_calls: std::sync::atomic::AtomicUsize::new(0),
        };
        let cache = Arc::new(InvalidateCountingCache {
            inner,
            invalidations: std::sync::atomic::AtomicUsize::new(0),
        });
        let repo = Arc::new(StaticPolicyRepo {
            policies: vec![policy],
        });
        let service = ReloadableAuthorizationService::new(repo, vec![], cache.clone());
        let ctx = SubjectContext::new(
            UserId::new("u1"),
            TenantId::new("t1"),
            &[],
            &[],
        );
        service.invalidate_tenant(&ctx).await.unwrap();
        assert_eq!(
            cache
                .invalidations
                .load(std::sync::atomic::Ordering::SeqCst),
            1
        );
    }
}
