use sqlx::PgPool;

use crate::error::{map_sqlx, InfraResult};

use super::DEFAULT_TENANT_ID;

/// Idempotent upsert of the Geosyntra platform super-tenant (Task 33.1).
pub async fn ensure_platform_tenant(pool: &PgPool) -> InfraResult<()> {
    sqlx::query(
        r#"
        INSERT INTO tenants (id, name, config, is_platform_tenant, created_at, updated_at)
        VALUES ($1, $2, '{}'::jsonb, TRUE, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            is_platform_tenant = TRUE,
            updated_at = NOW()
        "#,
    )
    .bind(DEFAULT_TENANT_ID)
    .bind("Geosyntra")
    .execute(pool)
    .await
    .map_err(map_sqlx)?;
    Ok(())
}
