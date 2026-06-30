use std::sync::Arc;

use application::{
    dto::governance::{
        CreateGovernanceProposalCommand, GovernanceProposalView,
        GOVERNANCE_REQUIRED_APPROVALS, GOVERNANCE_REVIEW_WINDOW_SECS, GOVERNANCE_TTL_SECS,
        RejectGovernanceProposalCommand,
    },
    error::{AppError, AppResult},
    ports::{governance::payload_hash, GovernanceRepository},
    SubjectContext,
};
use chrono::{DateTime as ChronoDateTime, Duration, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::map_sqlx;

pub struct PostgresGovernanceRepository {
    pool: Arc<PgPool>,
}

impl PostgresGovernanceRepository {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl GovernanceRepository for PostgresGovernanceRepository {
    async fn create_proposal(
        &self,
        ctx: SubjectContext,
        command: CreateGovernanceProposalCommand,
    ) -> AppResult<GovernanceProposalView> {
        let hash = payload_hash(&command.payload);
        let id = format!("gp-{}", Uuid::new_v4());
        let now = Utc::now();
        let reviewable_after = now + Duration::seconds(GOVERNANCE_REVIEW_WINDOW_SECS);
        let expires_at = now + Duration::seconds(GOVERNANCE_TTL_SECS);

        let result = sqlx::query(
            r#"
            INSERT INTO governance_proposals
              (id, tenant_id, proposal_type, payload, payload_hash, proposer_user_id,
               required_approvals, reviewable_after, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(&id)
        .bind(&command.tenant_id)
        .bind(&command.proposal_type)
        .bind(&command.payload)
        .bind(&hash)
        .bind(ctx.user_id().as_str())
        .bind(GOVERNANCE_REQUIRED_APPROVALS as i32)
        .bind(reviewable_after)
        .bind(expires_at)
        .execute(self.pool.as_ref())
        .await;

        match result {
            Ok(_) => self.get_proposal(ctx, &id).await,
            Err(e) if is_unique_violation(&e) => {
                Err(AppError::Conflict("duplicate_pending_proposal".into()))
            }
            Err(e) => Err(map_sqlx(e)),
        }
    }

    async fn get_proposal(
        &self,
        _ctx: SubjectContext,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView> {
        load_proposal(self.pool.as_ref(), proposal_id)
            .await?
            .ok_or_else(|| AppError::ValidationError("not_found".into()))
    }

    async fn list_proposals(
        &self,
        _ctx: SubjectContext,
        limit: u32,
    ) -> AppResult<Vec<GovernanceProposalView>> {
        let rows = sqlx::query_as::<_, ProposalRow>(
            r#"
            SELECT p.id, p.tenant_id, p.proposal_type, p.payload, p.payload_hash, p.status,
                   p.required_approvals, p.proposer_user_id, p.rejection_reason_code,
                   p.rejection_reason_text, p.created_at, p.expires_at, p.reviewable_after,
                   p.applied_at
            FROM governance_proposals p
            ORDER BY p.created_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit as i64)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(row.into_view(self.pool.as_ref()).await?);
        }
        Ok(out)
    }

    async fn pending_count(&self, _ctx: SubjectContext) -> AppResult<u32> {
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM governance_proposals WHERE status = 'pending'",
        )
        .fetch_one(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;
        Ok(row.0 as u32)
    }

    async fn approve(
        &self,
        ctx: SubjectContext,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView> {
        let mut view = self.get_proposal(ctx.clone(), proposal_id).await?;
        validate_pending(&view)?;

        if view.proposer_user_id == ctx.user_id().as_str() {
            return Err(AppError::Forbidden);
        }

        let now = Utc::now();
        if now.timestamp() < view.reviewable_after {
            return Err(AppError::ValidationError("review_window_active".into()));
        }

        if view.approver_ids.iter().any(|id| id == ctx.user_id().as_str()) {
            return Ok(view);
        }

        sqlx::query(
            r#"
            INSERT INTO governance_approvals (proposal_id, approver_user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(proposal_id)
        .bind(ctx.user_id().as_str())
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        view = self.get_proposal(ctx, proposal_id).await?;
        if view.approval_count >= view.required_approvals && view.status == "pending" {
            sqlx::query(
                "UPDATE governance_proposals SET status = 'approved' WHERE id = $1 AND status = 'pending'",
            )
            .bind(proposal_id)
            .execute(self.pool.as_ref())
            .await
            .map_err(map_sqlx)?;
            view.status = "approved".into();
        }
        Ok(view)
    }

    async fn reject(
        &self,
        ctx: SubjectContext,
        proposal_id: &str,
        command: RejectGovernanceProposalCommand,
    ) -> AppResult<GovernanceProposalView> {
        let view = self.get_proposal(ctx.clone(), proposal_id).await?;
        validate_pending(&view)?;

        if !application::dto::governance::REJECTION_REASONS.contains(&command.reason_code.as_str())
        {
            return Err(AppError::ValidationError("invalid_reason_code".into()));
        }

        sqlx::query(
            r#"
            UPDATE governance_proposals
            SET status = 'rejected',
                rejection_reason_code = $2,
                rejection_reason_text = $3
            WHERE id = $1 AND status = 'pending'
            "#,
        )
        .bind(proposal_id)
        .bind(&command.reason_code)
        .bind(&command.reason_text)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        self.get_proposal(ctx, proposal_id).await
    }

    async fn mark_applied(
        &self,
        proposal_id: &str,
        _result_id: Option<&str>,
    ) -> AppResult<GovernanceProposalView> {
        sqlx::query(
            r#"
            UPDATE governance_proposals
            SET status = 'applied', applied_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(proposal_id)
        .execute(self.pool.as_ref())
        .await
        .map_err(map_sqlx)?;

        load_proposal(
            self.pool.as_ref(),
            proposal_id,
        )
        .await?
        .ok_or_else(|| AppError::ValidationError("not_found".into()))
    }
}

fn validate_pending(view: &GovernanceProposalView) -> AppResult<()> {
    if view.status != "pending" {
        return Err(AppError::ValidationError("proposal_not_pending".into()));
    }
    if Utc::now().timestamp() > view.expires_at {
        return Err(AppError::ValidationError("proposal_expired".into()));
    }
    Ok(())
}

fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(
        err,
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505")
    )
}

async fn load_proposal(
    pool: &PgPool,
    proposal_id: &str,
) -> AppResult<Option<GovernanceProposalView>> {
    let row = sqlx::query_as::<_, ProposalRow>(
        r#"
        SELECT id, tenant_id, proposal_type, payload, payload_hash, status,
               required_approvals, proposer_user_id, rejection_reason_code,
               rejection_reason_text, created_at, expires_at, reviewable_after, applied_at
        FROM governance_proposals
        WHERE id = $1
        "#,
    )
    .bind(proposal_id)
    .fetch_optional(pool)
    .await
    .map_err(map_sqlx)?;

    match row {
        Some(r) => Ok(Some(r.into_view(pool).await?)),
        None => Ok(None),
    }
}

#[derive(sqlx::FromRow)]
struct ProposalRow {
    id: String,
    tenant_id: String,
    proposal_type: String,
    payload: serde_json::Value,
    payload_hash: String,
    status: String,
    required_approvals: i32,
    proposer_user_id: String,
    rejection_reason_code: Option<String>,
    rejection_reason_text: Option<String>,
    created_at: ChronoDateTime<Utc>,
    expires_at: ChronoDateTime<Utc>,
    reviewable_after: ChronoDateTime<Utc>,
    applied_at: Option<ChronoDateTime<Utc>>,
}

impl ProposalRow {
    async fn into_view(self, pool: &PgPool) -> AppResult<GovernanceProposalView> {
        let approvers: Vec<(String,)> = sqlx::query_as(
            "SELECT approver_user_id FROM governance_approvals WHERE proposal_id = $1 ORDER BY approved_at",
        )
        .bind(&self.id)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;

        let approver_ids: Vec<String> = approvers.into_iter().map(|(id,)| id).collect();
        let approval_count = approver_ids
            .iter()
            .filter(|id| **id != self.proposer_user_id)
            .count() as u32;

        Ok(GovernanceProposalView {
            id: self.id,
            tenant_id: self.tenant_id,
            proposal_type: self.proposal_type,
            payload: self.payload,
            payload_hash: self.payload_hash,
            status: self.status,
            required_approvals: self.required_approvals as u32,
            proposer_user_id: self.proposer_user_id,
            rejection_reason_code: self.rejection_reason_code,
            rejection_reason_text: self.rejection_reason_text,
            approval_count,
            approver_ids,
            created_at: self.created_at.timestamp(),
            expires_at: self.expires_at.timestamp(),
            reviewable_after: self.reviewable_after.timestamp(),
            applied_at: self.applied_at.map(|t| t.timestamp()),
        })
    }
}
