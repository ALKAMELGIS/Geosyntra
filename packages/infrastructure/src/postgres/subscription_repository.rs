use std::sync::Arc;

use application::{
    dto::billing::{SubscriptionView, UsageView},
    error::{AppError, AppResult},
    ports::{ActivateBillingPlanCommand, SubscriptionRepository},
};
use chrono::{Duration, Utc};
use domain::{BillingPlan, UserId};
use sqlx::PgPool;

use crate::error::map_sqlx;

pub struct PostgresSubscriptionRepository {
    pool: Arc<PgPool>,
}

impl PostgresSubscriptionRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl SubscriptionRepository for PostgresSubscriptionRepository {
    async fn get_for_user(&self, user_id: &UserId) -> AppResult<SubscriptionView> {
        let uid = parse_uid(user_id)?;
        let row: Option<SubscriptionRow> = sqlx::query_as(
            r#"
            SELECT plan, status, trial_ends_at, current_period_end
            FROM user_subscriptions WHERE user_id = $1
            "#,
        )
        .bind(uid)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(SubscriptionRow::into_view).unwrap_or_default())
    }

    async fn get_usage_for_user(&self, user_id: &UserId) -> AppResult<UsageView> {
        let uid = parse_uid(user_id)?;
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let row: Option<UsageRow> = sqlx::query_as(
            r#"
            SELECT ai_queries, grounding_calls, exports
            FROM usage_daily WHERE user_id = $1 AND usage_date = $2
            "#,
        )
        .bind(uid)
        .bind(&today)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(UsageRow::into_view).unwrap_or_default())
    }

    async fn start_trial(
        &self,
        user_id: &UserId,
        billing_plan_id: &str,
        days: u32,
    ) -> AppResult<SubscriptionView> {
        let uid = parse_uid(user_id)?;
        let now = Utc::now();
        let ends = now + Duration::days(i64::from(days));
        let trial_end = ends.to_rfc3339();
        sqlx::query(
            r#"
            INSERT INTO user_subscriptions (
                user_id, plan, status, billing_plan_id, trial_started_at, trial_ends_at,
                current_period_end, updated_at
            ) VALUES ($1, 'free', 'trialing', $2, $3, $4, $4, $3)
            ON CONFLICT (user_id) DO UPDATE SET
                plan = 'free',
                status = 'trialing',
                billing_plan_id = EXCLUDED.billing_plan_id,
                trial_started_at = EXCLUDED.trial_started_at,
                trial_ends_at = EXCLUDED.trial_ends_at,
                current_period_end = EXCLUDED.current_period_end,
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(uid)
        .bind(billing_plan_id)
        .bind(now)
        .bind(&trial_end)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        self.get_for_user(user_id).await
    }

    async fn activate_plan(
        &self,
        user_id: &UserId,
        command: ActivateBillingPlanCommand,
    ) -> AppResult<SubscriptionView> {
        let uid = parse_uid(user_id)?;
        let plan = normalize_plan(&command.billing_plan_id);
        let now = Utc::now();
        let period_end = (now + Duration::days(30)).to_rfc3339();
        let status = if command.payment_completed || plan == "enterprise" {
            "active"
        } else {
            "payment_pending"
        };
        let provider = command.provider.as_deref();

        sqlx::query(
            r#"
            INSERT INTO user_subscriptions (
                user_id, plan, status, billing_plan_id, billing_provider,
                current_period_end, trial_ends_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
            ON CONFLICT (user_id) DO UPDATE SET
                plan = EXCLUDED.plan,
                status = EXCLUDED.status,
                billing_plan_id = EXCLUDED.billing_plan_id,
                billing_provider = EXCLUDED.billing_provider,
                current_period_end = EXCLUDED.current_period_end,
                trial_ends_at = NULL,
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(uid)
        .bind(&plan)
        .bind(status)
        .bind(&command.billing_plan_id)
        .bind(provider)
        .bind(&period_end)
        .bind(now)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        if command.payment_completed && plan == "pro" {
            let invoice_id = uuid::Uuid::new_v4().to_string();
            let _ = sqlx::query(
                r#"
                INSERT INTO billing_invoices (
                    id, user_id, plan, amount_cents, currency, status, provider,
                    description, paid_at, period_start, period_end, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, 10000, 'USD', 'paid', $4,
                    'Pro subscription', $5, $5, $6, $5, $5
                )
                "#,
            )
            .bind(invoice_id)
            .bind(uid)
            .bind(&plan)
            .bind(provider.unwrap_or("stripe"))
            .bind(now)
            .bind(&period_end)
            .execute(self.pool.as_ref())
            .await;
        }

        self.get_for_user(user_id).await
    }
}

fn parse_uid(user_id: &UserId) -> AppResult<i64> {
    user_id
        .as_str()
        .parse::<i64>()
        .map_err(|_| AppError::ValidationError("invalid_user_id".into()))
}

fn normalize_plan(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "trial" => "free".into(),
        "pro" | "enterprise" => raw.trim().to_ascii_lowercase(),
        _ => "free".into(),
    }
}

#[derive(sqlx::FromRow)]
struct SubscriptionRow {
    plan: String,
    status: String,
    trial_ends_at: Option<String>,
    current_period_end: Option<String>,
}

impl SubscriptionRow {
    fn into_view(self) -> SubscriptionView {
        SubscriptionView {
            plan: Some(parse_plan(&self.plan)),
            status: Some(self.status),
            trial_ends_at: self.trial_ends_at,
            current_period_end: self.current_period_end,
        }
    }
}

#[derive(sqlx::FromRow)]
struct UsageRow {
    ai_queries: i32,
    grounding_calls: i32,
    exports: i32,
}

impl UsageRow {
    fn into_view(self) -> UsageView {
        UsageView {
            ai_queries: self.ai_queries.max(0) as u32,
            grounding_calls: self.grounding_calls.max(0) as u32,
            exports: self.exports.max(0) as u32,
        }
    }
}

fn parse_plan(raw: &str) -> BillingPlan {
    match raw.to_ascii_lowercase().as_str() {
        "pro" => BillingPlan::Pro,
        "enterprise" => BillingPlan::Enterprise,
        _ => BillingPlan::Free,
    }
}
