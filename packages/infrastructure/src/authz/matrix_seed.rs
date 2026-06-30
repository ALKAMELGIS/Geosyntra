use sqlx::PgPool;

use crate::error::{map_sqlx, InfraResult};

use super::{matrix, role_slug};

pub const DEFAULT_TENANT_ID: &str = "geosyntra-default";

/// Idempotent seed of Express MATRIX into `rbac_*` tables.
pub async fn seed_rbac_matrix(pool: &PgPool, tenant_id: &str) -> InfraResult<()> {
    for slug in matrix::PERMISSION_SLUGS {
        sqlx::query(
            r#"
            INSERT INTO rbac_permissions (slug, description)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO NOTHING
            "#,
        )
        .bind(slug)
        .bind(slug)
        .execute(pool)
        .await
        .map_err(map_sqlx)?;
    }

    for slug in matrix::ROLE_SLUGS {
        let normalized = role_slug::normalize_rbac_role(slug);
        let role_id = format!("{tenant_id}:{normalized}");
        let display = role_slug::rbac_role_to_display(normalized);
        let rank = role_slug::role_rank(normalized);

        sqlx::query(
            r#"
            INSERT INTO rbac_roles (id, tenant_id, slug, name, rank)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank
            "#,
        )
        .bind(&role_id)
        .bind(tenant_id)
        .bind(normalized)
        .bind(display)
        .bind(rank)
        .execute(pool)
        .await
        .map_err(map_sqlx)?;

        sqlx::query("DELETE FROM rbac_role_permissions WHERE role_id = $1")
            .bind(&role_id)
            .execute(pool)
            .await
            .map_err(map_sqlx)?;

        for perm in matrix::permissions_for_role(normalized) {
            sqlx::query(
                r#"
                INSERT INTO rbac_role_permissions (role_id, permission_slug)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(&role_id)
            .bind(perm)
            .execute(pool)
            .await
            .map_err(map_sqlx)?;
        }
    }

    Ok(())
}

pub async fn seed_default_tenant_matrix(pool: &PgPool) -> InfraResult<()> {
    seed_rbac_matrix(pool, DEFAULT_TENANT_ID).await
}
