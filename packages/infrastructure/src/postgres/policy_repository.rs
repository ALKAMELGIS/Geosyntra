use std::sync::Arc;

use application::{
    authorization::policys::{
        ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
        ApplicationStoredPolicy,
    },
    dto::policy::{
        ActivatePolicyVersionCommand, CreatePolicyVersionCommand, PolicyRuleCommand,
        PolicyVersionId, PolicyVersionSummaryView, PolicyVersionView, UpdatePolicyVersionCommand,
    },
    error::{AppError, AppResult},
    ports::PolicyRepository,
    authorization::{
        action::AuthorizationAction,
        attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
        relation::AuthorizationRelation,
        resource_type::AuthorizationResourceType,
    },
    SubjectContext,
};
use chrono::{DateTime as ChronoDateTime, Utc};
use domain::{DateTime, TenantId};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::map_sqlx;

pub struct PostgresPolicyRepository {
    pool: Arc<PgPool>,
}

impl PostgresPolicyRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl PolicyRepository for PostgresPolicyRepository {
    async fn list_versions(&self, ctx: SubjectContext) -> AppResult<Vec<PolicyVersionSummaryView>> {
        let tenant = ctx.tenant_id().as_str();
        let rows = sqlx::query_as::<_, VersionSummaryRow>(
            r#"
            SELECT v.id, v.tenant_id, v.version, v.label, v.is_active, v.created_at, v.activated_at,
                   COUNT(p.id)::INT AS policy_count
            FROM authorization_policy_versions v
            LEFT JOIN authorization_policies p ON p.version_id = v.id
            WHERE v.tenant_id = $1
            GROUP BY v.id
            ORDER BY v.version DESC
            "#,
        )
        .bind(tenant)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        Ok(rows.into_iter().map(VersionSummaryRow::into_view).collect())
    }

    async fn fetch_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
    ) -> AppResult<PolicyVersionView> {
        let tenant = ctx.tenant_id().as_str();
        let version = sqlx::query_as::<_, VersionRow>(
            r#"
            SELECT id, tenant_id, version, label, is_active, created_at, activated_at
            FROM authorization_policy_versions
            WHERE id = $1 AND tenant_id = $2
            "#,
        )
        .bind(id.as_str())
        .bind(tenant)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?
        .ok_or_else(|| AppError::ValidationError("not_found".into()))?;

        let policies = load_policies(self.pool.as_ref(), id.as_str()).await?;
        Ok(version.into_view(policies))
    }

    async fn create_version(
        &self,
        ctx: SubjectContext,
        command: CreatePolicyVersionCommand,
    ) -> AppResult<PolicyVersionId> {
        let tenant = ctx.tenant_id().as_str();
        let id = PolicyVersionId::new(format!("pv-{}", Uuid::new_v4()));
        let now = Utc::now();

        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;
        sqlx::query(
            r#"
            INSERT INTO authorization_policy_versions (id, tenant_id, version, label, is_active, created_at)
            VALUES ($1, $2, $3, $4, FALSE, $5)
            "#,
        )
        .bind(id.as_str())
        .bind(tenant)
        .bind(command.version as i32)
        .bind(&command.label)
        .bind(now)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        insert_policies(&mut tx, id.as_str(), &command.policies).await?;
        tx.commit().await.map_err(map_sqlx)?;
        Ok(id)
    }

    async fn update_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
        command: UpdatePolicyVersionCommand,
    ) -> AppResult<()> {
        let tenant = ctx.tenant_id().as_str();
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        if let Some(label) = command.label {
            let updated = sqlx::query(
                r#"
                UPDATE authorization_policy_versions SET label = $3
                WHERE id = $1 AND tenant_id = $2 AND is_active = FALSE
                "#,
            )
            .bind(id.as_str())
            .bind(tenant)
            .bind(label)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx)?;
            if updated.rows_affected() == 0 {
                return Err(AppError::ValidationError("not_found_or_active".into()));
            }
        }

        if let Some(policies) = command.policies {
            sqlx::query("DELETE FROM authorization_policies WHERE version_id = $1")
                .bind(id.as_str())
                .execute(&mut *tx)
                .await
                .map_err(map_sqlx)?;
            insert_policies(&mut tx, id.as_str(), &policies).await?;
        }

        tx.commit().await.map_err(map_sqlx)?;
        Ok(())
    }

    async fn delete_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
    ) -> AppResult<bool> {
        let tenant = ctx.tenant_id().as_str();
        let result = sqlx::query(
            r#"
            DELETE FROM authorization_policy_versions
            WHERE id = $1 AND tenant_id = $2 AND is_active = FALSE
            "#,
        )
        .bind(id.as_str())
        .bind(tenant)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn activate_version(
        &self,
        ctx: SubjectContext,
        id: PolicyVersionId,
        command: ActivatePolicyVersionCommand,
    ) -> AppResult<()> {
        let tenant = ctx.tenant_id().as_str();
        let activated_at = chrono_from_domain(&command.activated_at);
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        sqlx::query(
            r#"
            UPDATE authorization_policy_versions SET is_active = FALSE
            WHERE tenant_id = $1 AND is_active = TRUE
            "#,
        )
        .bind(tenant)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        let updated = sqlx::query(
            r#"
            UPDATE authorization_policy_versions
            SET is_active = TRUE, activated_at = $3
            WHERE id = $1 AND tenant_id = $2
            "#,
        )
        .bind(id.as_str())
        .bind(tenant)
        .bind(activated_at)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        if updated.rows_affected() == 0 {
            return Err(AppError::ValidationError("not_found".into()));
        }

        tx.commit().await.map_err(map_sqlx)?;
        Ok(())
    }

    async fn load_active_policies(
        &self,
        ctx: &SubjectContext,
    ) -> AppResult<Vec<ApplicationStoredPolicy>> {
        let tenant = ctx.tenant_id().as_str();
        let version_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM authorization_policy_versions
            WHERE tenant_id = $1 AND is_active = TRUE
            LIMIT 1
            "#,
        )
        .bind(tenant)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let Some(version_id) = version_id else {
            return Ok(vec![]);
        };
        load_policies(self.pool.as_ref(), &version_id).await
    }
}

async fn load_policies(
    pool: &PgPool,
    version_id: &str,
) -> AppResult<Vec<ApplicationStoredPolicy>> {
    let rows = sqlx::query_as::<_, PolicyRow>(
        r#"
        SELECT id, resource_type, action, effect, priority,
               required_relations, required_subject_attributes, required_resource_attributes
        FROM authorization_policies
        WHERE version_id = $1
        ORDER BY priority DESC
        "#,
    )
    .bind(version_id)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;

    rows.into_iter().map(PolicyRow::into_policy).collect()
}

async fn insert_policies(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    version_id: &str,
    policies: &[PolicyRuleCommand],
) -> AppResult<()> {
    for rule in policies {
        let relations = serde_json::to_value(&rule.required_relations).unwrap_or(json!([]));
        sqlx::query(
            r#"
            INSERT INTO authorization_policies
              (id, version_id, resource_type, action, effect, priority,
               required_relations, required_subject_attributes, required_resource_attributes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(rule.id.as_str())
        .bind(version_id)
        .bind(&rule.resource_type)
        .bind(&rule.action)
        .bind(effect_str(&rule.effect))
        .bind(*rule.priority)
        .bind(relations)
        .bind(&rule.required_subject_attributes)
        .bind(&rule.required_resource_attributes)
        .execute(&mut **tx)
        .await
        .map_err(map_sqlx)?;
    }
    Ok(())
}

fn effect_str(effect: &ApplicationPolicyEffect) -> &'static str {
    match effect {
        ApplicationPolicyEffect::Allow => "allow",
        ApplicationPolicyEffect::Deny => "deny",
    }
}

fn parse_effect(value: &str) -> ApplicationPolicyEffect {
    if value.eq_ignore_ascii_case("allow") {
        ApplicationPolicyEffect::Allow
    } else {
        ApplicationPolicyEffect::Deny
    }
}

fn chrono_from_domain(dt: &DateTime) -> ChronoDateTime<Utc> {
    ChronoDateTime::<Utc>::from_timestamp(*dt.datetime(), 0).unwrap_or_else(Utc::now)
}

#[derive(sqlx::FromRow)]
struct VersionSummaryRow {
    id: String,
    tenant_id: String,
    version: i32,
    label: String,
    is_active: bool,
    created_at: ChronoDateTime<Utc>,
    activated_at: Option<ChronoDateTime<Utc>>,
    policy_count: i32,
}

impl VersionSummaryRow {
    fn into_view(self) -> PolicyVersionSummaryView {
        PolicyVersionSummaryView {
            id: PolicyVersionId::new(self.id),
            tenant_id: TenantId::new(&self.tenant_id),
            version: self.version as u32,
            label: self.label,
            is_active: self.is_active,
            policy_count: self.policy_count as u32,
            created_at: DateTime::new(self.created_at.timestamp()),
            activated_at: self.activated_at.map(|t| DateTime::new(t.timestamp())),
        }
    }
}

#[derive(sqlx::FromRow)]
struct VersionRow {
    id: String,
    tenant_id: String,
    version: i32,
    label: String,
    is_active: bool,
    created_at: ChronoDateTime<Utc>,
    activated_at: Option<ChronoDateTime<Utc>>,
}

impl VersionRow {
    fn into_view(self, policies: Vec<ApplicationStoredPolicy>) -> PolicyVersionView {
        PolicyVersionView {
            id: PolicyVersionId::new(self.id),
            tenant_id: TenantId::new(&self.tenant_id),
            version: self.version as u32,
            label: self.label,
            is_active: self.is_active,
            policies,
            created_at: DateTime::new(self.created_at.timestamp()),
            activated_at: self.activated_at.map(|t| DateTime::new(t.timestamp())),
        }
    }
}

#[derive(sqlx::FromRow)]
struct PolicyRow {
    id: String,
    resource_type: String,
    action: String,
    effect: String,
    priority: i32,
    required_relations: serde_json::Value,
    required_subject_attributes: serde_json::Value,
    required_resource_attributes: serde_json::Value,
}

impl PolicyRow {
    fn into_policy(self) -> AppResult<ApplicationStoredPolicy> {
        let mut builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new(&self.id),
            ApplicationPolicyPriority::new(self.priority),
        );
        builder.set_resource_type(AuthorizationResourceType::new(&self.resource_type));
        builder.set_action(AuthorizationAction::new(&self.action));
        builder.set_effect(parse_effect(&self.effect));

        if let Some(relations) = self.required_relations.as_array() {
            for rel in relations {
                if let Some(name) = rel.as_str() {
                    builder.add_required_relation(AuthorizationRelation::new(name));
                }
            }
        }

        let mut subject_attrs = AuthorizationAttributes::new();
        merge_json_attrs(&mut subject_attrs, &self.required_subject_attributes);
        let mut resource_attrs = AuthorizationAttributes::new();
        merge_json_attrs(&mut resource_attrs, &self.required_resource_attributes);
        builder.add_required_attributes_from_json(subject_attrs, resource_attrs);

        builder.build()
    }
}

fn merge_json_attrs(target: &mut AuthorizationAttributes, value: &serde_json::Value) {
    if let Some(obj) = value.as_object() {
        for (key, val) in obj {
            if let Some(parsed) = json_to_attr_value(val) {
                target.add_attribute((AttributeKey::new(key), parsed));
            }
        }
    }
}

fn json_to_attr_value(value: &serde_json::Value) -> Option<AttributeValue> {
    match value {
        serde_json::Value::String(s) => Some(AttributeValue::String(s.clone())),
        serde_json::Value::Bool(b) => Some(AttributeValue::Bool(*b)),
        serde_json::Value::Number(n) => n.as_i64().map(AttributeValue::Number),
        serde_json::Value::Array(items) => {
            let strings: Vec<String> = items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect();
            Some(AttributeValue::StringList(strings))
        }
        _ => None,
    }
}
