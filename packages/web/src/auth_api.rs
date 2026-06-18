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
