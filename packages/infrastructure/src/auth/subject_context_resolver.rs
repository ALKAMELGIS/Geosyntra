use std::sync::Arc;

use application::{
    error::{AppError, AppResult},
    ports::{AuthCache, SubjectContextResolver},
    SubjectContext,
};
use domain::{Description, Name, Role, RoleId, TenantId, TemporaryGrant, UserId};
use sqlx::PgPool;

use crate::{
    authz::{
        permissions_from_slugs, rbac_role_to_display, role_from_slug,
        role_loader::try_load_role_by_id, role_loader::try_load_role_by_slug, role_slug,
        DEFAULT_TENANT_ID,
    },
    cache::{role_ttl, session_ttl},
    crypto::jwt::verify::{verify_token, VerifiedClaims},
    error::map_sqlx,
};
use application::ports::NoopAuthCache;

pub struct JwtSubjectContextResolver {
    pool: Arc<PgPool>,
    jwt_secret: String,
    default_tenant_id: String,
    cache: Arc<dyn AuthCache>,
}

impl JwtSubjectContextResolver {
    pub fn new(pool: Arc<PgPool>, jwt_secret: impl Into<String>) -> Self {
        Self {
            pool,
            jwt_secret: jwt_secret.into(),
            default_tenant_id: DEFAULT_TENANT_ID.to_string(),
            cache: Arc::new(NoopAuthCache),
        }
    }

    pub fn with_default_tenant_id(mut self, tenant_id: impl Into<String>) -> Self {
        self.default_tenant_id = tenant_id.into();
        self
    }

    pub fn with_cache(mut self, cache: Arc<dyn AuthCache>) -> Self {
        self.cache = cache;
        self
    }

    async fn load_roles_from_membership(
        &self,
        user_id: &UserId,
        tenant_id: &TenantId,
    ) -> AppResult<Vec<Role>> {
        if let Some(role_ids) = self
            .cache
            .get_membership_role_ids(user_id.as_str(), tenant_id.as_str())
            .await
        {
            return self.roles_from_ids(&role_ids).await;
        }

        let roles_json: Option<serde_json::Value> = sqlx::query_scalar(
            "SELECT roles FROM memberships WHERE user_id = $1 AND tenant_id = $2 LIMIT 1",
        )
        .bind(user_id.as_str())
        .bind(tenant_id.as_str())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let Some(value) = roles_json else {
            return Ok(Vec::new());
        };

        let role_ids: Vec<String> = value
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();

        if !role_ids.is_empty() {
            self.cache
                .set_membership_role_ids(
                    user_id.as_str(),
                    tenant_id.as_str(),
                    &role_ids,
                    session_ttl(),
                )
                .await;
        }

        self.roles_from_ids(&role_ids).await
    }

    async fn roles_from_ids(&self, role_ids: &[String]) -> AppResult<Vec<Role>> {
        let mut roles = Vec::new();
        for role_id in role_ids {
            if let Some(role) = self.load_role_by_id_cached(role_id).await? {
                roles.push(role);
            }
        }
        Ok(roles)
    }

    async fn load_role_by_id_cached(&self, role_id: &str) -> AppResult<Option<Role>> {
        if let Some(slugs) = self.cache.get_role_permission_slugs(role_id).await {
            if let Some(role) = role_from_permission_slugs(role_id, &slugs)? {
                return Ok(Some(role));
            }
        }

        let Some(role) = try_load_role_by_id(self.pool.as_ref(), role_id).await? else {
            return Ok(None);
        };

        let slugs: Vec<String> = role
            .permissions()
            .iter()
            .map(|p| p.id().as_str().to_string())
            .collect();
        if !slugs.is_empty() {
            self.cache
                .set_role_permission_slugs(role_id, &slugs, role_ttl())
                .await;
        }
        Ok(Some(role))
    }

    async fn load_active_temporary_grants(
        &self,
        user_id: &UserId,
        tenant_id: &TenantId,
    ) -> AppResult<Vec<TemporaryGrant>> {
        use std::collections::HashSet;

        use domain::{Action, DateTime, Permission, PermissionId, Resource};

        let rows: Vec<(String, String, String, String, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>, i64)> = sqlx::query_as(
            r#"
            SELECT id, description, resource, action, expires_at, created_at, version
            FROM temporary_grants
            WHERE user_id = $1 AND tenant_id = $2
              AND revoked_at IS NULL AND expires_at > NOW()
            "#,
        )
        .bind(user_id.as_str())
        .bind(tenant_id.as_str())
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let mut out = Vec::with_capacity(rows.len());
        for (id, description, resource, action, expires_at, created_at, version) in rows {
            let resource = Resource::new(&resource).map_err(AppError::from)?;
            let action = Action::new(&action).map_err(AppError::from)?;
            let description = Description::new(&description).map_err(AppError::from)?;
            let perm = Permission::new(
                PermissionId::new(&format!("tg:{id}")),
                resource,
                action,
                description.clone(),
                DateTime::new(created_at.timestamp()),
                version as u64,
            );
            out.push(TemporaryGrant::new(
                user_id.clone(),
                description,
                HashSet::from([perm]),
                DateTime::new(expires_at.timestamp()),
                DateTime::new(created_at.timestamp()),
                version as u64,
            ));
        }
        Ok(out)
    }

    async fn load_role_from_jwt_slug(
        &self,
        tenant_id: &TenantId,
        slug: &str,
    ) -> AppResult<Role> {
        let role_id = format!("{}:{}", tenant_id.as_str(), role_slug::normalize_rbac_role(slug));
        if let Some(role) = self.load_role_by_id_cached(&role_id).await? {
            return Ok(role);
        }
        if let Some(role) =
            try_load_role_by_slug(self.pool.as_ref(), tenant_id.as_str(), slug).await?
        {
            let slugs: Vec<String> = role
                .permissions()
                .iter()
                .map(|p| p.id().as_str().to_string())
                .collect();
            if !slugs.is_empty() {
                self.cache
                    .set_role_permission_slugs(&role_id, &slugs, role_ttl())
                    .await;
            }
            return Ok(role);
        }
        if strict_rbac_enabled() {
            return Err(AppError::ValidationError("role_not_found".into()));
        }
        Ok(role_from_slug(slug)?)
    }
}

fn role_from_permission_slugs(role_id: &str, slugs: &[String]) -> AppResult<Option<Role>> {
    if slugs.is_empty() {
        return Ok(None);
    }
    let Some((_tenant, slug)) = role_id.rsplit_once(':') else {
        return Ok(None);
    };
    let perms = permissions_from_slugs(slugs).map_err(AppError::from)?;
    let display = rbac_role_to_display(slug);
    let mut builder = Role::new(RoleId::new(role_id));
    builder
        .set_name(Name::new(display)?)
        .set_description(Description::new("RBAC role")?)
        .set_is_system_role(crate::authz::matrix::ROLE_SLUGS.contains(&slug))
        .set_created_at(domain::DateTime::new(0));
    for perm in perms {
        builder.add_permission(perm);
    }
    Ok(Some(builder.build()?))
}

fn strict_rbac_enabled() -> bool {
    std::env::var("GEOSYNTRA_STRICT_RBAC")
        .map(|v| matches!(v.as_str(), "1" | "true" | "yes"))
        .unwrap_or_else(|_| {
            std::env::var("NODE_ENV")
                .map(|v| v.eq_ignore_ascii_case("production"))
                .unwrap_or(false)
        })
}

#[async_trait::async_trait]
impl SubjectContextResolver for JwtSubjectContextResolver {
    async fn resolve(&self, bearer_token: &str) -> AppResult<SubjectContext> {
        let token = bearer_token
            .trim()
            .strip_prefix("Bearer ")
            .unwrap_or(bearer_token)
            .trim();
        if token.is_empty() {
            return Err(AppError::ValidationError("missing_token".into()));
        }

        let claims: VerifiedClaims = verify_token(&self.jwt_secret, token)?;
        let user_id = UserId::new(&claims.sub);
        let tenant_id = TenantId::new(&self.default_tenant_id);

        let mut roles = self
            .load_roles_from_membership(&user_id, &tenant_id)
            .await?;

        if roles.is_empty() {
            let slug = claims
                .role
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("trial_user");
            roles.push(
                self.load_role_from_jwt_slug(&tenant_id, slug)
                    .await?,
            );
        }

        let grants = self
            .load_active_temporary_grants(&user_id, &tenant_id)
            .await?;

        Ok(SubjectContext::new(
            user_id,
            tenant_id,
            &roles,
            &grants,
        ))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn strips_bearer_prefix() {
        let token = "Bearer abc.def.ghi";
        let stripped = token
            .trim()
            .strip_prefix("Bearer ")
            .unwrap_or(token)
            .trim();
        assert_eq!(stripped, "abc.def.ghi");
    }
}
