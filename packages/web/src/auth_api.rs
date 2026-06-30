use serde::Deserialize;
use serde_json::json;

use crate::{
    api_client::ApiClient,
    auth_session::AuthSession,
    error_display::ApiError,
};

#[derive(Debug, Deserialize)]
pub(crate) struct LoginUserRaw {
    id: Option<serde_json::Value>,
    email: Option<String>,
    name: Option<String>,
    role: Option<String>,
    role_slug: Option<String>,
    status: Option<String>,
    #[serde(default, alias = "tenantId")]
    tenant_id: Option<String>,
    #[serde(default)]
    permissions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct LoginResponse {
    user: Option<LoginUserRaw>,
    #[serde(default, alias = "accessToken")]
    access_token: Option<String>,
    #[serde(default, alias = "refreshToken")]
    refresh_token: Option<String>,
    error: Option<String>,
    code: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    ok: Option<bool>,
    user: Option<LoginUserRaw>,
    #[serde(default, alias = "accessToken")]
    access_token: Option<String>,
}

pub async fn login(email: &str, password: &str) -> Result<AuthSession, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "email": email.trim(), "password": password });
    let data: LoginResponse = client.post_json("/api/auth/login", &body, None).await?;

    if let Some(err) = data.error.or(data.code) {
        return Err(ApiError::Http {
            status: 400,
            message: data.message.unwrap_or(err),
        });
    }

    let user = data.user.ok_or_else(|| ApiError::Parse {
        message: "login response missing user".into(),
    })?;
    let access = data
        .access_token
        .ok_or_else(|| ApiError::Parse {
            message: "login response missing access_token".into(),
        })?;

    Ok(session_from_user(
        user,
        access,
        data.refresh_token,
    ))
}

#[derive(Debug, Deserialize)]
struct LifecycleOk {
    ok: Option<bool>,
    message: Option<String>,
    #[serde(default, alias = "devVerificationLink")]
    dev_verification_link: Option<String>,
    #[serde(default, alias = "devResetLink")]
    dev_reset_link: Option<String>,
    error: Option<String>,
    #[serde(default, alias = "retryAfterSec")]
    retry_after_sec: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct VerifyEmailResponse {
    ok: Option<bool>,
    user: Option<LoginUserRaw>,
    #[serde(default, alias = "accessToken")]
    access_token: Option<String>,
    #[serde(default, alias = "pendingApproval")]
    pending_approval: Option<bool>,
    error: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ForgotUsernameResponse {
    ok: Option<bool>,
    found: Option<bool>,
    #[serde(default, alias = "signInId")]
    sign_in_id: Option<String>,
    message: Option<String>,
    error: Option<String>,
}

fn lifecycle_err(data: &LifecycleOk) -> ApiError {
    ApiError::Http {
        status: 400,
        message: data
            .message
            .clone()
            .or_else(|| data.error.clone())
            .unwrap_or_else(|| "Request failed".into()),
    }
}

pub async fn verify_email(token: &str) -> Result<(AuthSession, bool), ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/auth/verify-email?token={}",
        urlencoding::encode(token.trim())
    );
    let data: VerifyEmailResponse = client.get_json(&path, None).await?;
    if data.ok != Some(true) {
        return Err(ApiError::Http {
            status: 400,
            message: data
                .message
                .or(data.error)
                .unwrap_or_else(|| "Verification failed".into()),
        });
    }
    let user = data.user.ok_or_else(|| ApiError::Parse {
        message: "verify response missing user".into(),
    })?;
    let access = data
        .access_token
        .ok_or_else(|| ApiError::Parse {
            message: "verify response missing access token".into(),
        })?;
    let pending = data.pending_approval.unwrap_or(false);
    Ok((session_from_user(user, access, None), pending))
}

pub async fn resend_verification(email: &str) -> Result<(String, Option<String>), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "email": email.trim() });
    let data: LifecycleOk = client
        .post_json("/api/auth/resend-verification", &body, None)
        .await?;
    if data.ok != Some(true) {
        return Err(lifecycle_err(&data));
    }
    let message = data
        .message
        .unwrap_or_else(|| "Verification email sent.".into());
    Ok((message, data.dev_verification_link))
}

pub async fn forgot_username(email: &str) -> Result<(bool, Option<String>, String), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "email": email.trim() });
    let data: ForgotUsernameResponse = client
        .post_json("/api/auth/forgot-username", &body, None)
        .await?;
    if data.ok != Some(true) {
        return Err(ApiError::Http {
            status: 400,
            message: data
                .message
                .or(data.error)
                .unwrap_or_else(|| "Lookup failed".into()),
        });
    }
    Ok((
        data.found.unwrap_or(false),
        data.sign_in_id,
        data.message
            .unwrap_or_else(|| "Lookup complete.".into()),
    ))
}

pub async fn forgot_password(email: &str) -> Result<(String, Option<String>), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "email": email.trim() });
    let data: LifecycleOk = client
        .post_json("/api/auth/forgot-password", &body, None)
        .await?;
    if data.ok != Some(true) {
        return Err(lifecycle_err(&data));
    }
    let message = data.message.unwrap_or_else(|| {
        "If an account exists, check your inbox for reset instructions.".into()
    });
    Ok((message, data.dev_reset_link))
}

pub async fn reset_password(token: &str, password: &str) -> Result<String, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({ "token": token.trim(), "password": password });
    let data: LifecycleOk = client
        .post_json("/api/auth/reset-password", &body, None)
        .await?;
    if data.ok != Some(true) {
        return Err(lifecycle_err(&data));
    }
    Ok(data
        .message
        .unwrap_or_else(|| "Password updated. You can sign in now.".into()))
}

pub async fn change_password(
    token: &str,
    email: &str,
    current_password: &str,
    new_password: &str,
) -> Result<String, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "email": email.trim(),
        "currentPassword": current_password,
        "newPassword": new_password,
    });
    let data: LifecycleOk = client
        .post_json("/api/auth/change-password", &body, Some(token))
        .await?;
    if data.ok != Some(true) {
        return Err(lifecycle_err(&data));
    }
    Ok(data
        .message
        .unwrap_or_else(|| "Password updated successfully.".into()))
}

pub fn is_email_not_verified_error(err: &ApiError) -> bool {
    let msg = err.user_message().to_ascii_lowercase();
    msg.contains("email_not_verified") || msg.contains("not verified")
}

pub async fn fetch_me(token: &str) -> Result<AuthSession, ApiError> {
    let client = ApiClient::from_env();
    let data: MeResponse = client
        .get_json("/api/rbac/me", Some(token))
        .await?;
    let user = data.user.ok_or_else(|| ApiError::Parse {
        message: "me response missing user".into(),
    })?;
    let access = data
        .access_token
        .unwrap_or_else(|| token.to_string());
    Ok(session_from_user(user, access, None))
}

#[derive(Debug, Deserialize)]
struct RegisterResponse {
    user: Option<LoginUserRaw>,
    error: Option<String>,
    message: Option<String>,
}

pub async fn register(name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "name": name.trim(),
        "email": email.trim(),
        "password": password,
        "requestedPlan": "trial",
    });
    let data: RegisterResponse = client.post_json("/api/auth/register", &body, None).await?;
    if let Some(err) = data.error {
        return Err(ApiError::Http {
            status: 400,
            message: data.message.unwrap_or(err),
        });
    }
    if data.user.is_none() {
        return Err(ApiError::Parse {
            message: "register response missing user".into(),
        });
    }
    Ok(())
}

pub fn session_from_user(
    user: LoginUserRaw,
    access_token: String,
    refresh_token: Option<String>,
) -> AuthSession {
    let user_id = user.id.and_then(|v| match v {
        serde_json::Value::String(s) => Some(s),
        serde_json::Value::Number(n) => Some(n.to_string()),
        _ => None,
    });
    AuthSession {
        access_token: Some(access_token),
        refresh_token,
        email: user.email,
        name: user.name,
        role: user.role,
        role_slug: user.role_slug,
        status: user.status,
        tenant_id: user.tenant_id,
        permissions: user.permissions,
        user_id,
    }
}

#[cfg(test)]
mod tests {
    use super::session_from_user;
    use crate::auth_session::AuthSession;

    #[test]
    fn builds_session_from_user_fields() {
        let session = session_from_user(
            super::LoginUserRaw {
                id: Some(serde_json::json!("1")),
                email: Some("admin@geosyntra.com".into()),
                name: Some("Admin".into()),
                role: Some("Owner".into()),
                role_slug: Some("owner".into()),
                status: Some("Active".into()),
                tenant_id: Some("geosyntra-default".into()),
                permissions: vec!["admin.panel".into(), "admin.tokens.manage".into()],
            },
            "jwt".into(),
            None,
        );
        assert!(session.is_signed_in());
        assert!(session.can_access_admin());
        assert!(session.has_permission("admin.tokens.manage"));
        assert_eq!(session.email.as_deref(), Some("admin@geosyntra.com"));
    }
}
