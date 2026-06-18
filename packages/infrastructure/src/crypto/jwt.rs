use std::time::{SystemTime, UNIX_EPOCH};

use application::{
    dto::auth::PublicUserView,
    error::{AppError, AppResult},
    ports::TokenIssuer,
};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::Serialize;

const ACCESS_TTL_SEC: i64 = 60 * 60 * 24 * 7;
const REFRESH_TTL_SEC: i64 = 60 * 60 * 24 * 30;

#[derive(Debug, Serialize)]
struct JwtClaims {
    sub: String,
    email: String,
    role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    typ: Option<String>,
    iat: i64,
    exp: i64,
}

#[derive(Clone)]
pub struct JwtTokenIssuer {
    secret: String,
}

impl JwtTokenIssuer {
    pub fn from_env() -> AppResult<Self> {
        let secret = std::env::var("JWT_SECRET")
            .or_else(|_| std::env::var("RBAC_JWT_SECRET"))
            .unwrap_or_else(|_| {
                if std::env::var("NODE_ENV")
                    .map(|v| v == "production")
                    .unwrap_or(false)
                {
                    panic!("JWT_SECRET is required in production");
                }
                "geosyntra-dev-jwt-secret-change-me".into()
            });
        Ok(Self { secret })
    }

    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into(),
        }
    }

    pub fn secret(&self) -> &str {
        &self.secret
    }

    fn now() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }

    fn sign(&self, mut claims: JwtClaims) -> AppResult<String> {
        let now = Self::now();
        claims.iat = now;
        if claims.exp == 0 {
            claims.exp = now + ACCESS_TTL_SEC;
        }
        encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
        .map_err(|e| AppError::Repository(e.to_string()))
    }
}

#[async_trait::async_trait]
impl TokenIssuer for JwtTokenIssuer {
    fn issue_access_token(&self, user: &PublicUserView) -> AppResult<String> {
        let sub = user
            .id
            .as_ref()
            .map(|id| id.as_str().to_string())
            .ok_or_else(|| AppError::ValidationError("missing_user_id".into()))?;
        let email = user
            .email
            .as_ref()
            .map(|e| e.email().to_string())
            .unwrap_or_default();
        let role = user
            .role_slug
            .clone()
            .or_else(|| user.role.clone())
            .unwrap_or_else(|| "trial_user".into());

        let now = Self::now();
        self.sign(JwtClaims {
            sub,
            email,
            role,
            typ: None,
            iat: now,
            exp: now + ACCESS_TTL_SEC,
        })
    }

    fn issue_refresh_token(&self, user: &PublicUserView) -> AppResult<String> {
        let sub = user
            .id
            .as_ref()
            .map(|id| id.as_str().to_string())
            .ok_or_else(|| AppError::ValidationError("missing_user_id".into()))?;
        let email = user
            .email
            .as_ref()
            .map(|e| e.email().to_string())
            .unwrap_or_default();
        let role = user
            .role_slug
            .clone()
            .or_else(|| user.role.clone())
            .unwrap_or_else(|| "trial_user".into());

        let now = Self::now();
        self.sign(JwtClaims {
            sub,
            email,
            role,
            typ: Some("refresh".into()),
            iat: now,
            exp: now + REFRESH_TTL_SEC,
        })
    }
}

pub mod verify {
    use jsonwebtoken::{decode, DecodingKey, Validation};

    use super::*;

    #[derive(Debug, serde::Deserialize)]
    pub struct VerifiedClaims {
        pub sub: String,
        pub email: Option<String>,
        pub role: Option<String>,
        pub typ: Option<String>,
    }

    pub fn verify_token(secret: &str, token: &str) -> AppResult<VerifiedClaims> {
        let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
        validation.validate_exp = true;
        let data = decode::<VerifiedClaims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &validation,
        )
        .map_err(|_| AppError::ValidationError("invalid_token".into()))?;
        Ok(data.claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use domain::{Email, UserId};

    #[test]
    fn issues_access_and_refresh_tokens() {
        let issuer = JwtTokenIssuer::new("test-secret");
        let user = PublicUserView {
            id: Some(UserId::new("42")),
            email: Some(Email::new("u@test.com").unwrap()),
            role_slug: Some("admin".into()),
            ..Default::default()
        };
        let access = issuer.issue_access_token(&user).unwrap();
        let refresh = issuer.issue_refresh_token(&user).unwrap();
        assert_ne!(access, refresh);
        let claims = verify::verify_token("test-secret", &access).unwrap();
        assert_eq!(claims.sub, "42");
        assert_eq!(claims.role.as_deref(), Some("admin"));
    }
}
