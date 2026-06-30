use application::{
    dto::governance::{CreateGovernanceProposalCommand, RejectGovernanceProposalCommand},
    usecases::{
        ApproveGovernanceProposalUseCase, CreateGovernanceProposalUseCase,
        GetGovernanceProposalUseCase, ListGovernanceProposalsUseCase,
        PendingGovernanceCountUseCase, RejectGovernanceProposalUseCase,
    },
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreateProposalRequest {
    pub proposal_type: String,
    pub tenant_id: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct RejectProposalRequest {
    pub reason_code: String,
    pub reason_text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    50
}

fn proposal_to_json(p: &application::dto::governance::GovernanceProposalView) -> serde_json::Value {
    json!({
        "id": p.id,
        "tenantId": p.tenant_id,
        "proposalType": p.proposal_type,
        "payload": p.payload,
        "payloadHash": p.payload_hash,
        "status": p.status,
        "requiredApprovals": p.required_approvals,
        "proposerUserId": p.proposer_user_id,
        "approvalCount": p.approval_count,
        "approverIds": p.approver_ids,
        "rejectionReasonCode": p.rejection_reason_code,
        "rejectionReasonText": p.rejection_reason_text,
        "createdAt": p.created_at,
        "expiresAt": p.expires_at,
        "reviewableAfter": p.reviewable_after,
        "appliedAt": p.applied_at,
    })
}

pub async fn list_proposals(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Query(query): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state
        .governance
        .list
        .execute(ctx, env, query.limit)
        .await?;
    let proposals: Vec<_> = rows.iter().map(proposal_to_json).collect();
    Ok(Json(json!({ "ok": true, "proposals": proposals })))
}

pub async fn pending_count(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let count = state.governance.pending_count.execute(ctx, env).await?;
    Ok(Json(json!({ "ok": true, "count": count })))
}

pub async fn get_proposal(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .governance
        .get
        .execute(ctx, env, &id)
        .await?;
    Ok(Json(json!({ "ok": true, "proposal": proposal_to_json(&view) })))
}

pub async fn create_proposal(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreateProposalRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .governance
        .create
        .execute(
            ctx,
            env,
            CreateGovernanceProposalCommand {
                proposal_type: body.proposal_type,
                tenant_id: body.tenant_id,
                payload: body.payload,
            },
        )
        .await?;
    Ok(Json(json!({ "ok": true, "proposal": proposal_to_json(&view) })))
}

pub async fn approve_proposal(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .governance
        .approve
        .execute(ctx, env, &id)
        .await?;
    Ok(Json(json!({ "ok": true, "proposal": proposal_to_json(&view) })))
}

pub async fn reject_proposal(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
    Json(body): Json<RejectProposalRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let view = state
        .governance
        .reject
        .execute(
            ctx,
            env,
            &id,
            RejectGovernanceProposalCommand {
                reason_code: body.reason_code,
                reason_text: body.reason_text,
            },
        )
        .await?;
    Ok(Json(json!({ "ok": true, "proposal": proposal_to_json(&view) })))
}
