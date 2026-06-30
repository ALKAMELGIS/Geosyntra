//! Idempotent default ABAC policy version per tenant (Task 23.5.1–23.5.2).
//!
//! Creates an activated `express-baseline-v1` version with **dev-friendly allow rules**
//! so the admin policy editor and authorization path have real rows to test against.
//! RBAC role permissions remain authoritative; stored rules extend baseline access.

use chrono::Utc;
use serde_json::json;
use sqlx::PgPool;

use crate::error::{map_sqlx, InfraResult};

pub const BASELINE_POLICY_VERSION: u32 = 1;
pub const BASELINE_POLICY_LABEL: &str = "express-baseline-v1";

fn version_id(tenant_id: &str) -> String {
    format!("{tenant_id}:express-baseline-v1")
}

/// Dev baseline rules: resource_type + action pairs aligned with use-case `RESOURCE`/`ACTION`.
struct DevRule {
    id_suffix: &'static str,
    resource_type: &'static str,
    action: &'static str,
    effect: &'static str,
    priority: i32,
}

const DEV_BASELINE_RULES: &[DevRule] = &[
    DevRule {
        id_suffix: "user-read",
        resource_type: "user",
        action: "read",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "user-manage",
        resource_type: "user",
        action: "manage",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "policy-read",
        resource_type: "policy",
        action: "read",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "policy-create",
        resource_type: "policy",
        action: "create",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "governance-read",
        resource_type: "governance",
        action: "read",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "governance-approve",
        resource_type: "governance",
        action: "approve",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "tenant-read",
        resource_type: "tenant",
        action: "read",
        effect: "allow",
        priority: 100,
    },
    DevRule {
        id_suffix: "membership-read",
        resource_type: "membership",
        action: "read",
        effect: "allow",
        priority: 90,
    },
    DevRule {
        id_suffix: "grant-read",
        resource_type: "temporary_grant",
        action: "read",
        effect: "allow",
        priority: 90,
    },
    DevRule {
        id_suffix: "invite-create",
        resource_type: "invite",
        action: "create",
        effect: "allow",
        priority: 90,
    },
    DevRule {
        id_suffix: "aoi-read",
        resource_type: "aoi",
        action: "read",
        effect: "allow",
        priority: 80,
    },
    DevRule {
        id_suffix: "aoi-write",
        resource_type: "aoi",
        action: "write",
        effect: "allow",
        priority: 80,
    },
    DevRule {
        id_suffix: "billing-deny",
        resource_type: "billing",
        action: "manage",
        effect: "deny",
        priority: 200,
    },
];

/// Seed activated baseline policy version when none exists for `tenant_id`.
pub async fn seed_default_abac_policy(pool: &PgPool, tenant_id: &str) -> InfraResult<()> {
    let active: Option<String> = sqlx::query_scalar(
        r#"
        SELECT id FROM authorization_policy_versions
        WHERE tenant_id = $1 AND is_active = TRUE
        LIMIT 1
        "#,
    )
    .bind(tenant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;

    if active.is_some() {
        return Ok(());
    }

    let id = version_id(tenant_id);
    let now = Utc::now();

    let mut tx = pool.begin().await.map_err(map_sqlx)?;

    sqlx::query(
        r#"
        INSERT INTO authorization_policy_versions
          (id, tenant_id, version, label, is_active, created_at, activated_at)
        VALUES ($1, $2, $3, $4, TRUE, $5, $5)
        ON CONFLICT (id) DO UPDATE SET
          is_active = TRUE,
          activated_at = COALESCE(authorization_policy_versions.activated_at, EXCLUDED.activated_at)
        "#,
    )
    .bind(&id)
    .bind(tenant_id)
    .bind(BASELINE_POLICY_VERSION as i32)
    .bind(BASELINE_POLICY_LABEL)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(map_sqlx)?;

    let rule_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::bigint FROM authorization_policies WHERE version_id = $1",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_sqlx)?;

    if rule_count == 0 {
        for rule in DEV_BASELINE_RULES {
            let rule_id = format!("{id}:{}", rule.id_suffix);
            sqlx::query(
                r#"
                INSERT INTO authorization_policies
                  (id, version_id, resource_type, action, effect, priority,
                   required_relations, required_subject_attributes, required_resource_attributes)
                VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)
                ON CONFLICT (id) DO NOTHING
                "#,
            )
            .bind(&rule_id)
            .bind(&id)
            .bind(rule.resource_type)
            .bind(rule.action)
            .bind(rule.effect)
            .bind(rule.priority)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx)?;
        }
    }

    tx.commit().await.map_err(map_sqlx)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_id_is_tenant_scoped() {
        assert_eq!(
            version_id("geosyntra-default"),
            "geosyntra-default:express-baseline-v1"
        );
    }

    #[test]
    fn dev_rules_include_allow_and_deny() {
        assert!(DEV_BASELINE_RULES.iter().any(|r| r.effect == "allow"));
        assert!(DEV_BASELINE_RULES.iter().any(|r| r.effect == "deny"));
    }
}
