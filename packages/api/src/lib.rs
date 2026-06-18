//! GeoSyntra HTTP API — composition root and router (Task 12–15).

pub mod integration_seed;

use std::sync::Arc;

use application::{
    ports::{PolicyRepository, SubjectContextResolver},
    usecases::{
        membership::{
            CreateMembershipUseCase, DeleteMembershipUseCase, GetMembershipUseCase,
            ListMembershipsByTenantUseCase, SetUserRoleUseCase,
        },
        policy::{
            ActivatePolicyVersionUseCase, CreatePolicyVersionUseCase, DeletePolicyVersionUseCase,
            GetPolicyVersionUseCase, ListPolicyVersionsUseCase, UpdatePolicyVersionUseCase,
        },
        user::{
            approve::ApproveUserUseCase, create::CreateUserUseCase, delete::DeleteUserUseCase,
            reactivate::ReactivateUserUseCase, read::list::ListUserUseCase,
            suspend::SuspendUserUseCase, update::UpdateUserUseCase,
        },
        AcceptInviteUseCase, CreateInviteUseCase, ExportPermissionsMatrixUseCase,
        GetAuthMeUseCase, GetBillingMeUseCase, ListAuditLogUseCase, ListBillingPlansUseCase,
        ListInvitesUseCase, LoginUseCase, PreviewInviteUseCase, RefreshTokenUseCase,
        RegisterUseCase, ResendVerificationUseCase, ResetPasswordUseCase, StartBillingTrialUseCase,
        ActivateBillingPlanUseCase, VerifyEmailUseCase, ForgotPasswordUseCase, ForgotUsernameUseCase,
        ApproveGovernanceProposalUseCase, CreateGovernanceProposalUseCase,
        GetGovernanceProposalUseCase, ListGovernanceProposalsUseCase,
        PendingGovernanceCountUseCase, RejectGovernanceProposalUseCase,
        CreateTemporaryGrantUseCase, ListTemporaryGrantsUseCase, RevokeTemporaryGrantUseCase,
        GetTenantUseCase, ListTenantsUseCase,
    },
    SubjectContext,
};
use axum::Router;
use domain::{TenantId, UserId};
use infrastructure::{
    billing::ExpressBillingPlanCatalog,
    bootstrap, connect, ensure_system_owners,
    crypto::{BcryptPasswordHasher, JwtTokenIssuer},
    postgres::{
        PostgresAuditRepository, PostgresGovernanceRepository, PostgresAuthDirectoryRepository,
        PostgresAuthLifecycleRepository, PostgresInviteRepository, PostgresInvitedUserCreator,
        PostgresMembershipRepository, PostgresPlatformConfigRepository, PostgresPolicyRepository, PostgresRefreshTokenRepository,
        PostgresSubscriptionRepository, PostgresTenantBootstrapService, PostgresTenantRepository,
        PostgresTemporaryGrantRepository, PostgresUserIdAllocator, PostgresUserRepository,
    },
    JwtSubjectContextResolver, ReloadableAuthorizationService, build_auth_cache_from_env,
    PostgresTokenVault,
};
use interface::{
    app_state, billing::BillingUseCases, health_router as interface_health_router,
    AuthLifecycleUseCases, GovernanceUseCases, MembershipUseCases, PolicyUseCases, RbacUseCases,
    TemporaryGrantUseCases, TenantUseCases,
};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

/// Health-only router (no database).
pub fn health_router() -> Router {
    interface_health_router()
}

/// Build shared application state from a PostgreSQL pool (reloadable ABAC policies).
pub async fn build_app_state(pool: Arc<PgPool>) -> interface::AppState {
    let policy_repo = Arc::new(PostgresPolicyRepository::new(pool.clone()));
    let bootstrap_ctx = SubjectContext::new(
        UserId::new("bootstrap"),
        TenantId::new(application::rbac::DEFAULT_TENANT_ID),
        &[],
        &[],
    );
    let initial_policies = policy_repo
        .load_active_policies(&bootstrap_ctx)
        .await
        .unwrap_or_default();

    let auth_cache = build_auth_cache_from_env().await;
    let auth_service =
        ReloadableAuthorizationService::new(policy_repo.clone(), initial_policies, auth_cache.clone());

    let auth_dir = Arc::new(PostgresAuthDirectoryRepository::new(pool.clone()));
    let auth_lifecycle_repo = Arc::new(PostgresAuthLifecycleRepository::new(pool.clone()));
    let jwt = JwtTokenIssuer::from_env().expect("JWT issuer");
    let refresh = Arc::new(PostgresRefreshTokenRepository::new(pool.clone(), jwt.clone()));
    let hasher = Arc::new(BcryptPasswordHasher::default());

    let auth_lifecycle = AuthLifecycleUseCases {
        verify_email: Arc::new(VerifyEmailUseCase::new(
            auth_lifecycle_repo.clone(),
            Arc::new(jwt.clone()),
        )),
        reset_password: Arc::new(ResetPasswordUseCase::new(
            auth_lifecycle_repo.clone(),
            hasher.clone(),
        )),
        resend_verification: Arc::new(ResendVerificationUseCase::new(
            auth_lifecycle_repo.clone(),
            auth_dir.clone(),
        )),
        forgot_password: Arc::new(ForgotPasswordUseCase::new(auth_lifecycle_repo.clone())),
        forgot_username: Arc::new(ForgotUsernameUseCase::new(auth_lifecycle_repo.clone())),
    };

    let user_repo = Arc::new(PostgresUserRepository::new(pool.clone()));
    let membership_repo = Arc::new(PostgresMembershipRepository::new(pool.clone()));
    let grant_repo = Arc::new(PostgresTemporaryGrantRepository::new(pool.clone()));
    let id_allocator = Arc::new(PostgresUserIdAllocator::new(pool.clone()));
    let invite_repo = Arc::new(PostgresInviteRepository::new(pool.clone()));
    let audit_repo = Arc::new(PostgresAuditRepository::new(pool.clone()));
    let governance_repo = Arc::new(PostgresGovernanceRepository::new(pool.clone()));
    let tenant_repo = Arc::new(PostgresTenantRepository::new(pool.clone()));
    let tenant_bootstrap = Arc::new(PostgresTenantBootstrapService::new(pool.clone()));
    let platform_config_repo = Arc::new(PostgresPlatformConfigRepository::new(pool.clone()));
    let subscription_repo = Arc::new(PostgresSubscriptionRepository::new(pool.clone()));
    let invited_user_creator = Arc::new(PostgresInvitedUserCreator::new(
        pool.clone(),
        Arc::new(BcryptPasswordHasher::default()),
    ));

    let login = Arc::new(LoginUseCase::new(
        auth_dir.clone(),
        Arc::new(jwt.clone()),
        refresh.clone(),
    ));
    let register = Arc::new(RegisterUseCase::new(auth_dir.clone()));
    let get_me = Arc::new(GetAuthMeUseCase::new(auth_dir.clone(), auth_service.clone()));
    let refresh_uc = Arc::new(RefreshTokenUseCase::new(
        refresh,
        auth_dir.clone(),
        Arc::new(jwt.clone()),
    ));

    let rbac = RbacUseCases {
        list_users: Arc::new(ListUserUseCase::new(user_repo.clone(), auth_service.clone())),
        update_user: Arc::new(UpdateUserUseCase::new(user_repo.clone(), auth_service.clone())),
        delete_user: Arc::new(DeleteUserUseCase::new(user_repo.clone(), auth_service.clone())),
        approve_user: Arc::new(ApproveUserUseCase::new(user_repo.clone(), auth_service.clone())),
        suspend_user: Arc::new(SuspendUserUseCase::new(user_repo.clone(), auth_service.clone())),
        reactivate_user: Arc::new(ReactivateUserUseCase::new(
            user_repo.clone(),
            auth_service.clone(),
        )),
        set_user_role: Arc::new(
            SetUserRoleUseCase::new(
                membership_repo.clone(),
                user_repo.clone(),
                auth_service.clone(),
            )
            .with_auth_cache(auth_cache.clone()),
        ),
        create_user: Arc::new(
            CreateUserUseCase::new(user_repo, auth_service.clone()).with_id_allocator(id_allocator),
        ),
        list_audit: Arc::new(ListAuditLogUseCase::new(
            audit_repo.clone(),
            auth_service.clone(),
        )),
        list_invites: Arc::new(ListInvitesUseCase::new(
            invite_repo.clone(),
            auth_service.clone(),
        )),
        create_invite: Arc::new(CreateInviteUseCase::new(
            invite_repo.clone(),
            auth_dir.clone(),
            auth_service.clone(),
        )),
        preview_invite: Arc::new(PreviewInviteUseCase::new(invite_repo.clone())),
        accept_invite: Arc::new(AcceptInviteUseCase::new(
            invite_repo,
            auth_dir,
            invited_user_creator,
            Arc::new(jwt.clone()),
        )),
        export_permissions_matrix: Arc::new(ExportPermissionsMatrixUseCase::new(
            auth_service.clone(),
        )),
    };

    let policy = PolicyUseCases {
        list_versions: Arc::new(ListPolicyVersionsUseCase::new(
            policy_repo.clone(),
            auth_service.clone(),
        )),
        get_version: Arc::new(GetPolicyVersionUseCase::new(
            policy_repo.clone(),
            auth_service.clone(),
        )),
        create_version: Arc::new(CreatePolicyVersionUseCase::new(
            policy_repo.clone(),
            auth_service.clone(),
        )),
        update_version: Arc::new(UpdatePolicyVersionUseCase::new(
            policy_repo.clone(),
            auth_service.clone(),
        )),
        delete_version: Arc::new(DeletePolicyVersionUseCase::new(
            policy_repo.clone(),
            auth_service.clone(),
        )),
        activate_version: Arc::new(
            ActivatePolicyVersionUseCase::new(policy_repo.clone(), auth_service.clone())
                .with_policy_reload(auth_service.clone()),
        ),
    };

    let governance = GovernanceUseCases {
        list: Arc::new(ListGovernanceProposalsUseCase::new(
            governance_repo.clone(),
            auth_service.clone(),
        )),
        get: Arc::new(GetGovernanceProposalUseCase::new(
            governance_repo.clone(),
            auth_service.clone(),
        )),
        create: Arc::new(CreateGovernanceProposalUseCase::new(
            governance_repo.clone(),
            audit_repo.clone(),
            auth_service.clone(),
        )),
        approve: Arc::new(ApproveGovernanceProposalUseCase::new(
            governance_repo.clone(),
            audit_repo.clone(),
            auth_service.clone(),
            policy.create_version.clone(),
            policy.activate_version.clone(),
            tenant_repo.clone(),
            tenant_bootstrap.clone(),
            platform_config_repo.clone(),
        )),
        reject: Arc::new(RejectGovernanceProposalUseCase::new(
            governance_repo.clone(),
            audit_repo.clone(),
            auth_service.clone(),
        )),
        pending_count: Arc::new(PendingGovernanceCountUseCase::new(
            governance_repo,
            auth_service.clone(),
        )),
    };

    let tenant = TenantUseCases {
        list: Arc::new(ListTenantsUseCase::new(
            tenant_repo.clone(),
            auth_service.clone(),
        )),
        get: Arc::new(GetTenantUseCase::new(
            tenant_repo.clone(),
            auth_service.clone(),
        )),
    };

    let membership_uc = MembershipUseCases {
        list: Arc::new(ListMembershipsByTenantUseCase::new(
            membership_repo.clone(),
            auth_service.clone(),
        )),
        get: Arc::new(GetMembershipUseCase::new(
            membership_repo.clone(),
            auth_service.clone(),
        )),
        create: Arc::new(CreateMembershipUseCase::new(
            membership_repo.clone(),
            auth_service.clone(),
        )),
        delete: Arc::new(
            DeleteMembershipUseCase::new(membership_repo.clone(), auth_service.clone())
                .with_auth_cache(auth_cache.clone()),
        ),
        set_role: rbac.set_user_role.clone(),
    };

    let temporary_grant = TemporaryGrantUseCases {
        list: Arc::new(ListTemporaryGrantsUseCase::new(
            grant_repo.clone(),
            auth_service.clone(),
        )),
        create: Arc::new(CreateTemporaryGrantUseCase::new(
            grant_repo.clone(),
            auth_service.clone(),
        )),
        revoke: Arc::new(RevokeTemporaryGrantUseCase::new(
            grant_repo,
            auth_service.clone(),
        )),
    };

    let billing = BillingUseCases {
        list_plans: Arc::new(ListBillingPlansUseCase::new(Arc::new(
            ExpressBillingPlanCatalog,
        ))),
        get_me: Arc::new(GetBillingMeUseCase::new(
            subscription_repo.clone(),
            auth_service.clone(),
        )),
        start_trial: Arc::new(StartBillingTrialUseCase::new(
            subscription_repo.clone(),
            auth_service.clone(),
        )),
        activate: Arc::new(ActivateBillingPlanUseCase::new(
            subscription_repo,
            auth_service.clone(),
        )),
    };

    let subject_resolver: Arc<dyn SubjectContextResolver> = Arc::new(
        JwtSubjectContextResolver::new(pool.clone(), jwt.secret().to_string())
            .with_cache(auth_cache),
    );

    let token_vault: Arc<dyn application::ports::TokenVault> =
        Arc::new(PostgresTokenVault::new(pool.clone()));

    app_state(
        login,
        register,
        get_me,
        refresh_uc,
        auth_lifecycle,
        rbac,
        policy,
        tenant,
        membership_uc,
        temporary_grant,
        governance,
        billing,
        platform_config_repo,
        membership_repo,
        auth_service.clone(),
        subject_resolver,
        token_vault,
    )
}

/// Migrate, seed RBAC matrix, ensure default Owner/Super Admin, and connect.
pub async fn prepare_database(
    database_url: &str,
) -> Result<Arc<PgPool>, Box<dyn std::error::Error + Send + Sync>> {
    let pool = Arc::new(connect(database_url).await?);
    bootstrap(pool.as_ref()).await?;
    ensure_system_owners(pool.as_ref()).await?;
    Ok(pool)
}

/// Connect and return the full API router.
pub async fn router_from_database_url(
    database_url: &str,
) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
    let pool = prepare_database(database_url).await?;
    Ok(build_router(build_app_state(pool).await))
}

/// Connect and return the full API router with optional static SPA fallback.
pub async fn router_with_static_from_database_url(
    database_url: &str,
) -> Result<Router, Box<dyn std::error::Error + Send + Sync>> {
    let pool = prepare_database(database_url).await?;
    Ok(build_router_with_static(build_app_state(pool).await))
}

/// Axum router for the GeoSyntra API with tracing.
pub fn build_router(state: interface::AppState) -> Router {
    interface::router(state).layer(TraceLayer::new_for_http())
}

/// API + Vite static assets when `frontend/dist` is present.
pub fn build_router_with_static(state: interface::AppState) -> Router {
    interface::router_with_static(state).layer(TraceLayer::new_for_http())
}
