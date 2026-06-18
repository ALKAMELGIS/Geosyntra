use std::sync::Arc;

use application::{
    ports::{MembershipReadRepository, PlatformConfigRepository, PolicyReloadService, SubjectContextResolver},
    usecases::{
        membership::{
            CreateMembershipUseCase, DeleteMembershipUseCase, GetMembershipUseCase,
            ListMembershipsByTenantUseCase, SetUserRoleUseCase,
        },
        user::{
            approve::ApproveUserUseCase, create::CreateUserUseCase, delete::DeleteUserUseCase,
            reactivate::ReactivateUserUseCase, read::list::ListUserUseCase,
            suspend::SuspendUserUseCase, update::UpdateUserUseCase,
        },
        AcceptInviteUseCase, CreateInviteUseCase, ExportPermissionsMatrixUseCase,
        ForgotPasswordUseCase, ForgotUsernameUseCase, GetAuthMeUseCase, ListAuditLogUseCase,
        ListInvitesUseCase, LoginUseCase, PreviewInviteUseCase, RefreshTokenUseCase,
        RegisterUseCase, ResendVerificationUseCase, ResetPasswordUseCase, VerifyEmailUseCase,
        ApproveGovernanceProposalUseCase, CreateGovernanceProposalUseCase,
        GetGovernanceProposalUseCase, ListGovernanceProposalsUseCase,
        PendingGovernanceCountUseCase, RejectGovernanceProposalUseCase,
        CreateTemporaryGrantUseCase, ListTemporaryGrantsUseCase, RevokeTemporaryGrantUseCase,
        GetTenantUseCase, ListTenantsUseCase,
    },
};

use crate::billing::BillingUseCases;

#[derive(Clone)]
pub struct PolicyUseCases {
    pub list_versions: Arc<application::usecases::policy::ListPolicyVersionsUseCase>,
    pub get_version: Arc<application::usecases::policy::GetPolicyVersionUseCase>,
    pub create_version: Arc<application::usecases::policy::CreatePolicyVersionUseCase>,
    pub update_version: Arc<application::usecases::policy::UpdatePolicyVersionUseCase>,
    pub delete_version: Arc<application::usecases::policy::DeletePolicyVersionUseCase>,
    pub activate_version: Arc<application::usecases::policy::ActivatePolicyVersionUseCase>,
}

#[derive(Clone)]
pub struct RbacUseCases {
    pub list_users: Arc<ListUserUseCase>,
    pub update_user: Arc<UpdateUserUseCase>,
    pub delete_user: Arc<DeleteUserUseCase>,
    pub approve_user: Arc<ApproveUserUseCase>,
    pub suspend_user: Arc<SuspendUserUseCase>,
    pub reactivate_user: Arc<ReactivateUserUseCase>,
    pub set_user_role: Arc<SetUserRoleUseCase>,
    pub create_user: Arc<CreateUserUseCase>,
    pub list_audit: Arc<ListAuditLogUseCase>,
    pub list_invites: Arc<ListInvitesUseCase>,
    pub create_invite: Arc<CreateInviteUseCase>,
    pub preview_invite: Arc<PreviewInviteUseCase>,
    pub accept_invite: Arc<AcceptInviteUseCase>,
    pub export_permissions_matrix: Arc<ExportPermissionsMatrixUseCase>,
}

#[derive(Clone)]
pub struct AuthLifecycleUseCases {
    pub verify_email: Arc<VerifyEmailUseCase>,
    pub reset_password: Arc<ResetPasswordUseCase>,
    pub resend_verification: Arc<ResendVerificationUseCase>,
    pub forgot_password: Arc<ForgotPasswordUseCase>,
    pub forgot_username: Arc<ForgotUsernameUseCase>,
}

#[derive(Clone)]
pub struct TenantUseCases {
    pub list: Arc<ListTenantsUseCase>,
    pub get: Arc<GetTenantUseCase>,
}

#[derive(Clone)]
pub struct MembershipUseCases {
    pub list: Arc<ListMembershipsByTenantUseCase>,
    pub get: Arc<GetMembershipUseCase>,
    pub create: Arc<CreateMembershipUseCase>,
    pub delete: Arc<DeleteMembershipUseCase>,
    pub set_role: Arc<SetUserRoleUseCase>,
}

#[derive(Clone)]
pub struct GovernanceUseCases {
    pub list: Arc<ListGovernanceProposalsUseCase>,
    pub get: Arc<GetGovernanceProposalUseCase>,
    pub create: Arc<CreateGovernanceProposalUseCase>,
    pub approve: Arc<ApproveGovernanceProposalUseCase>,
    pub reject: Arc<RejectGovernanceProposalUseCase>,
    pub pending_count: Arc<PendingGovernanceCountUseCase>,
}

#[derive(Clone)]
pub struct TemporaryGrantUseCases {
    pub list: Arc<ListTemporaryGrantsUseCase>,
    pub create: Arc<CreateTemporaryGrantUseCase>,
    pub revoke: Arc<RevokeTemporaryGrantUseCase>,
}

#[derive(Clone)]
pub struct AppState {
    pub login: Arc<LoginUseCase>,
    pub register: Arc<RegisterUseCase>,
    pub get_me: Arc<GetAuthMeUseCase>,
    pub refresh: Arc<RefreshTokenUseCase>,
    pub auth_lifecycle: AuthLifecycleUseCases,
    pub rbac: RbacUseCases,
    pub policy: PolicyUseCases,
    pub tenant: TenantUseCases,
    pub membership_uc: MembershipUseCases,
    pub temporary_grant: TemporaryGrantUseCases,
    pub governance: GovernanceUseCases,
    pub billing: BillingUseCases,
    pub platform_config: Arc<dyn PlatformConfigRepository>,
    pub membership: Arc<dyn MembershipReadRepository>,
    pub policy_reload: Arc<dyn PolicyReloadService>,
    pub subject_resolver: Arc<dyn SubjectContextResolver>,
}
