use std::sync::Arc;

use application::{
    dto::auth::{LoginCommand, RegisterCommand},
    error::AppError,
    ports::{MembershipReadRepository, PlatformConfigRepository, PolicyReloadService, SubjectContextResolver},
    usecases::{GetAuthMeUseCase, LoginUseCase, RefreshTokenUseCase, RegisterUseCase},
};
use axum::{extract::State, Json};
use domain::Email;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::{AppState, RbacUseCases},
};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub remember: bool,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
    #[serde(default)]
    pub requested_role: Option<String>,
    #[serde(default)]
    pub requested_plan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct LogoutRequest {
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(Debug, Serialize, Default)]
pub struct PublicUserJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "lastName")]
    pub last_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "phoneNumber")]
    pub phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "emailNotifications")]
    pub email_notifications: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "pushNotifications")]
    pub push_notifications: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "twoFactorAuth")]
    pub two_factor_auth: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "tenantId")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub permissions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AuthSessionJson {
    pub user: PublicUserJson,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

impl From<application::dto::auth::PublicUserView> for PublicUserJson {
    fn from(view: application::dto::auth::PublicUserView) -> Self {
        Self {
            id: view.id.map(|id| id.as_str().to_string()),
            email: view.email.map(|e| e.email().to_string()),
            name: view.name,
            role: view.role,
            role_slug: view.role_slug,
            status: view.status,
            tenant_id: view.tenant_id,
            permissions: view.permissions,
            ..Default::default()
        }
    }
}

impl From<application::dto::auth::AuthSessionView> for AuthSessionJson {
    fn from(session: application::dto::auth::AuthSessionView) -> Self {
        Self {
            user: session.user.into(),
            access_token: session.access_token,
            refresh_token: session.refresh_token,
        }
    }
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthSessionJson>, AppErrorResponse> {
    let email = Email::new(&body.email).map_err(|e| AppErrorResponse::from(AppError::from(e)))?;
    let session = state
        .login
        .execute(
            LoginCommand {
                email,
                password: body.password,
                remember: body.remember,
            },
            None,
        )
        .await?;
    Ok(Json(session.into()))
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<PublicUserJson>, AppErrorResponse> {
    let email = Email::new(&body.email).map_err(|e| AppErrorResponse::from(AppError::from(e)))?;
    let result = state
        .register
        .execute(RegisterCommand {
            name: body.name,
            email,
            password: body.password,
            requested_role: body.requested_role,
            requested_plan: body.requested_plan,
        })
        .await?;
    Ok(Json(result.user.into()))
}

pub async fn me(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<PublicUserJson>, AppErrorResponse> {
    let user = state.get_me.execute(ctx, env).await?;
    Ok(Json(user.into()))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(body): Json<RefreshRequest>,
) -> Result<Json<AuthSessionJson>, AppErrorResponse> {
    let session = state.refresh.execute(&body.refresh_token).await?;
    Ok(Json(session.into()))
}

pub async fn logout(
    State(state): State<AppState>,
    Json(body): Json<LogoutRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    if let Some(ref token) = body.refresh_token {
        state.refresh.revoke(token).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

/// Clears session cookies — Express does not revoke refresh tokens server-side.
pub async fn logout_all() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}

/// In-memory auth event stream stub — Express returns recent auth audit events.
pub async fn auth_events() -> Json<serde_json::Value> {
    Json(json!({ "items": [] }))
}

#[allow(clippy::too_many_arguments)]
pub fn app_state(
    login: Arc<LoginUseCase>,
    register: Arc<RegisterUseCase>,
    get_me: Arc<GetAuthMeUseCase>,
    refresh: Arc<RefreshTokenUseCase>,
    auth_lifecycle: crate::state::AuthLifecycleUseCases,
    rbac: RbacUseCases,
    policy: crate::state::PolicyUseCases,
    tenant: crate::state::TenantUseCases,
    membership_uc: crate::state::MembershipUseCases,
    temporary_grant: crate::state::TemporaryGrantUseCases,
    governance: crate::state::GovernanceUseCases,
    billing: crate::billing::BillingUseCases,
    platform_config: Arc<dyn PlatformConfigRepository>,
    membership: Arc<dyn MembershipReadRepository>,
    policy_reload: Arc<dyn PolicyReloadService>,
    subject_resolver: Arc<dyn SubjectContextResolver>,
) -> AppState {
    AppState {
        login,
        register,
        get_me,
        refresh,
        auth_lifecycle,
        rbac,
        policy,
        tenant,
        membership_uc,
        temporary_grant,
        governance,
        billing,
        platform_config,
        membership,
        policy_reload,
        subject_resolver,
    }
}
