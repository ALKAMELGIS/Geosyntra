//! First-run Owner / Super Admin bootstrap — mirrors Express `bootstrapRbacSuperAdmin` +
//! `ensureSystemOwnerAccounts`.

use application::ports::PasswordHasher;
use sqlx::PgPool;

use crate::{
    authz::{
        display_role_to_slug, rbac_role_to_display, DEFAULT_TENANT_ID,
    },
    crypto::BcryptPasswordHasher,
    error::{map_sqlx, InfraResult},
    postgres::user_id::next_user_id,
};

const DEV_DEFAULT_PASSWORD: &str = "GeoSyntra-Admin-2026!";
const DEFAULT_OWNER_EMAIL: &str = "admin@geosyntra.com";
const DEFAULT_SUPER_EMAIL: &str = "super@geosyntra.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapAccountSpec {
    pub email: String,
    pub name: String,
    pub role_slug: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootstrapAction {
    Skipped { reason: &'static str },
    Unchanged { email: String },
    Created { email: String, role_slug: &'static str },
    Promoted { email: String, role_slug: &'static str },
    PasswordRepaired { email: String },
}

fn is_production_deployment() -> bool {
    fn env_is_prod(key: &str) -> bool {
        std::env::var(key)
            .map(|v| v.trim().eq_ignore_ascii_case("production"))
            .unwrap_or(false)
    }
    env_is_prod("GEOSYNTRA_ENV") || env_is_prod("NODE_ENV") || env_is_prod("RUST_ENV")
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn trim_env(key: &str) -> String {
    std::env::var(key).unwrap_or_default().trim().to_string()
}

/// Password for bootstrap accounts — env first, dev default when non-production.
pub fn resolve_bootstrap_password() -> String {
    for key in ["RBAC_BOOTSTRAP_PASSWORD", "GEOSYNTRA_OWNER_PASSWORD"] {
        let value = trim_env(key);
        if value.len() >= 12 {
            return value;
        }
    }
    if is_production_deployment() {
        String::new()
    } else {
        DEV_DEFAULT_PASSWORD.to_string()
    }
}

fn parse_email_list(raw: &str) -> Vec<String> {
    raw.split([',', ';', ' ', '\n', '\t'])
        .map(normalize_email)
        .filter(|email| !email.is_empty() && email.contains('@'))
        .collect()
}

pub fn list_system_owner_emails() -> Vec<String> {
    let mut emails = vec![normalize_email(DEFAULT_OWNER_EMAIL)];
    emails.extend(parse_email_list(&trim_env("RBAC_SYSTEM_OWNER_EMAILS")));
    let primary = trim_env("RBAC_BOOTSTRAP_EMAIL");
    if !primary.is_empty() {
        emails.push(normalize_email(&primary));
    }
    dedupe_emails(emails)
}

fn dedupe_emails(emails: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for email in emails {
        if !out.iter().any(|existing| existing == &email) {
            out.push(email);
        }
    }
    out
}

pub fn default_first_run_accounts() -> Vec<BootstrapAccountSpec> {
    let owner_email = {
        let from_env = trim_env("RBAC_BOOTSTRAP_EMAIL");
        if from_env.is_empty() {
            DEFAULT_OWNER_EMAIL.to_string()
        } else {
            normalize_email(&from_env)
        }
    };
    let owner_name = {
        let from_env = trim_env("RBAC_BOOTSTRAP_NAME");
        if from_env.is_empty() {
            "GeoSyntra Admin".to_string()
        } else {
            from_env
        }
    };
    let super_email = {
        let from_env = trim_env("RBAC_BOOTSTRAP_SUPER_EMAIL");
        if from_env.is_empty() {
            DEFAULT_SUPER_EMAIL.to_string()
        } else {
            normalize_email(&from_env)
        }
    };
    let super_name = {
        let from_env = trim_env("RBAC_BOOTSTRAP_SUPER_NAME");
        if from_env.is_empty() {
            "GeoSyntra Super Admin".to_string()
        } else {
            from_env
        }
    };

    let mut accounts = vec![BootstrapAccountSpec {
        email: owner_email.clone(),
        name: owner_name,
        role_slug: "owner",
    }];
    if super_email != owner_email {
        accounts.push(BootstrapAccountSpec {
            email: super_email,
            name: super_name,
            role_slug: "super_admin",
        });
    }
    accounts
}

async fn user_has_privileged_role(pool: &PgPool, role_slug: &str) -> InfraResult<bool> {
    let rows = sqlx::query_scalar::<_, String>(
        r#"SELECT role FROM admin_users WHERE status IN ('Active', 'Pending Approval')"#,
    )
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;
    Ok(rows
        .iter()
        .any(|role| display_role_to_slug(role) == role_slug))
}

struct ExistingUser {
    id: i64,
    role: String,
    password_hash: Option<String>,
}

async fn find_user_by_email(pool: &PgPool, email: &str) -> InfraResult<Option<ExistingUser>> {
    let row = sqlx::query_as::<_, (i64, String, Option<String>)>(
        r#"
        SELECT id, role, password_hash
        FROM admin_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        "#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;
    Ok(row.map(|(id, role, password_hash)| ExistingUser {
        id,
        role,
        password_hash,
    }))
}

async fn upsert_membership_role(
    pool: &PgPool,
    user_id: i64,
    role_slug: &str,
) -> InfraResult<()> {
    let roles_json = serde_json::json!([format!("{DEFAULT_TENANT_ID}:{role_slug}")]);
    sqlx::query(
        r#"
        INSERT INTO memberships (user_id, tenant_id, roles, created_at, version)
        VALUES ($1, $2, $3, NOW(), 1)
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET
            roles = EXCLUDED.roles,
            version = memberships.version + 1
        "#,
    )
    .bind(user_id)
    .bind(DEFAULT_TENANT_ID)
    .bind(roles_json)
    .execute(pool)
    .await
    .map_err(map_sqlx)?;
    Ok(())
}

async fn ensure_account(
    pool: &PgPool,
    spec: &BootstrapAccountSpec,
    password: &str,
    hasher: &BcryptPasswordHasher,
) -> InfraResult<BootstrapAction> {
    let role_display = rbac_role_to_display(spec.role_slug);
    let existing = find_user_by_email(pool, &spec.email).await?;

    if let Some(user) = existing {
        let current_slug = display_role_to_slug(&user.role);
        let needs_role = current_slug != spec.role_slug;
        let needs_password = user
            .password_hash
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty();

        if !needs_role && !needs_password {
            return Ok(BootstrapAction::Unchanged {
                email: spec.email.clone(),
            });
        }

        let password_hash = if needs_password {
            Some(hasher.hash(password)?)
        } else {
            None
        };

        if needs_role {
            sqlx::query(
                r#"
                UPDATE admin_users
                SET role = $2, status = 'Active', email_verified = TRUE, updated_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(user.id)
            .bind(role_display)
            .execute(pool)
            .await
            .map_err(map_sqlx)?;
            upsert_membership_role(pool, user.id, spec.role_slug).await?;
        }

        if let Some(hash) = password_hash {
            sqlx::query(
                r#"
                UPDATE admin_users
                SET password_hash = $2, status = 'Active', email_verified = TRUE, updated_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(user.id)
            .bind(hash)
            .execute(pool)
            .await
            .map_err(map_sqlx)?;
            return Ok(BootstrapAction::PasswordRepaired {
                email: spec.email.clone(),
            });
        }

        return Ok(BootstrapAction::Promoted {
            email: spec.email.clone(),
            role_slug: spec.role_slug,
        });
    }

    if password.len() < 12 {
        return Ok(BootstrapAction::Skipped {
            reason: "password_min_12",
        });
    }

    let id = next_user_id(pool).await?;
    let user_id: i64 = id
        .as_str()
        .parse()
        .map_err(|_| application::error::AppError::Repository("invalid_user_id".into()))?;
    let password_hash = hasher.hash(password)?;
    let username = spec.email.clone();

    sqlx::query(
        r#"
        INSERT INTO admin_users (
            id, email, name, username, role, status, password_hash, email_verified, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'Active', $6, TRUE, NOW(), NOW())
        "#,
    )
    .bind(user_id)
    .bind(&spec.email)
    .bind(&spec.name)
    .bind(&username)
    .bind(role_display)
    .bind(&password_hash)
    .execute(pool)
    .await
    .map_err(map_sqlx)?;

    upsert_membership_role(pool, user_id, spec.role_slug).await?;

    Ok(BootstrapAction::Created {
        email: spec.email.clone(),
        role_slug: spec.role_slug,
    })
}

/// Ensure default Owner / Super Admin accounts exist before serving traffic.
pub async fn ensure_system_owners(pool: &PgPool) -> InfraResult<Vec<BootstrapAction>> {
    let password = resolve_bootstrap_password();
    if password.len() < 12 {
        eprintln!(
            "[rbac] Owner bootstrap skipped — set RBAC_BOOTSTRAP_PASSWORD (min 12 chars) in production"
        );
        return Ok(vec![BootstrapAction::Skipped {
            reason: "password_not_set",
        }]);
    }

    let hasher = BcryptPasswordHasher::new(12);
    let mut actions = Vec::new();
    let owner_exists = user_has_privileged_role(pool, "owner").await?;
    let super_admin_exists = user_has_privileged_role(pool, "super_admin").await?;

    if !owner_exists || !super_admin_exists {
        for spec in default_first_run_accounts() {
            let needed = match spec.role_slug {
                "owner" => !owner_exists,
                "super_admin" => !super_admin_exists,
                _ => true,
            };
            if !needed {
                continue;
            }
            let action = ensure_account(pool, &spec, &password, &hasher).await?;
            log_action(&action);
            actions.push(action);
        }
    }

    for email in list_system_owner_emails() {
        let name = {
            let from_env = trim_env("RBAC_BOOTSTRAP_NAME");
            if from_env.is_empty() {
                "GeoSyntra Admin".to_string()
            } else {
                from_env
            }
        };
        let spec = BootstrapAccountSpec {
            email: email.clone(),
            name,
            role_slug: "owner",
        };
        let action = ensure_account(pool, &spec, &password, &hasher).await?;
        if !matches!(action, BootstrapAction::Unchanged { .. }) {
            log_action(&action);
        }
        actions.push(action);
    }

    Ok(actions)
}

fn log_action(action: &BootstrapAction) {
    match action {
        BootstrapAction::Created { email, role_slug } => {
            eprintln!("[rbac] Bootstrapped {role_slug}: {email}");
        }
        BootstrapAction::Promoted { email, role_slug } => {
            eprintln!("[rbac] Promoted {email} → {role_slug}");
        }
        BootstrapAction::PasswordRepaired { email } => {
            eprintln!("[rbac] Repaired bootstrap password for {email}");
        }
        BootstrapAction::Skipped { reason } => {
            eprintln!("[rbac] Bootstrap skipped: {reason}");
        }
        BootstrapAction::Unchanged { .. } => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_first_run_accounts_include_owner_and_super_admin() {
        let accounts = default_first_run_accounts();
        assert_eq!(accounts.len(), 2);
        assert_eq!(accounts[0].email, "admin@geosyntra.com");
        assert_eq!(accounts[0].role_slug, "owner");
        assert_eq!(accounts[1].email, "super@geosyntra.com");
        assert_eq!(accounts[1].role_slug, "super_admin");
    }

    #[test]
    fn list_system_owner_emails_includes_default_and_env() {
        unsafe {
            std::env::set_var("RBAC_SYSTEM_OWNER_EMAILS", "ops@example.com");
        }
        let emails = list_system_owner_emails();
        unsafe {
            std::env::remove_var("RBAC_SYSTEM_OWNER_EMAILS");
        }
        assert!(emails.contains(&"admin@geosyntra.com".to_string()));
        assert!(emails.contains(&"ops@example.com".to_string()));
    }

    #[test]
    fn dev_password_has_default_when_not_production() {
        unsafe {
            std::env::remove_var("RBAC_BOOTSTRAP_PASSWORD");
            std::env::remove_var("GEOSYNTRA_OWNER_PASSWORD");
            std::env::set_var("GEOSYNTRA_ENV", "development");
        }
        assert_eq!(resolve_bootstrap_password(), DEV_DEFAULT_PASSWORD);
        unsafe {
            std::env::remove_var("GEOSYNTRA_ENV");
        }
    }
}
