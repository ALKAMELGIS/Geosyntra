use application::dto::policy::UpdatePolicyVersionCommand;
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppErrorResponse,
    extract::{AuthSubject, RequestEnvironment},
    rbac::mappers::policy::{
        parse_policy_id, parse_policy_rules, policy_summary_to_json, policy_version_to_json,
        PolicyRuleJson,
    },
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct CreatePolicyVersionRequest {
    pub version: Option<u32>,
    pub label: String,
    #[serde(default)]
    pub policies: Vec<PolicyRuleJson>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePolicyVersionRequest {
    pub label: Option<String>,
    pub policies: Option<Vec<PolicyRuleJson>>,
}

pub async fn list_policies(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let rows = state
        .policy
        .list_versions
        .execute(ctx, env)
        .await?;
    let versions: Vec<_> = rows.iter().map(policy_summary_to_json).collect();
    Ok(Json(json!({ "ok": true, "versions": versions })))
}

pub async fn get_policy(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_policy_id(&id);
    let view = state
        .policy
        .get_version
        .execute(ctx, env, id)
        .await?;
    Ok(Json(json!({ "ok": true, "version": policy_version_to_json(&view) })))
}

pub async fn create_policy(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Json(body): Json<CreatePolicyVersionRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let tenant_id = ctx.tenant_id().as_str().to_string();
    let policies = parse_policy_rules(&body.policies);
    let version = match body.version {
        Some(v) => v,
        None => {
            let rows = state
                .policy
                .list_versions
                .execute(ctx.clone(), env.clone())
                .await?;
            rows.iter().map(|v| v.version).max().unwrap_or(0) + 1
        }
    };
    let policy_values: Vec<_> = policies
        .iter()
        .map(|p| {
            json!({
                "id": p.id.as_str(),
                "resource_type": p.resource_type,
                "action": p.action,
                "effect": match p.effect {
                    application::authorization::policys::ApplicationPolicyEffect::Allow => "allow",
                    application::authorization::policys::ApplicationPolicyEffect::Deny => "deny",
                },
                "priority": *p.priority,
                "required_relations": p.required_relations,
                "required_subject_attributes": p.required_subject_attributes,
                "required_resource_attributes": p.required_resource_attributes,
            })
        })
        .collect();
    let payload = json!({
        "version": version,
        "label": body.label,
        "policies": policy_values,
    });
    let proposal = state
        .governance
        .create
        .execute(
            ctx,
            env,
            application::dto::governance::CreateGovernanceProposalCommand {
                proposal_type: "policy.create".into(),
                tenant_id,
                payload,
            },
        )
        .await?;
    Ok(Json(json!({
        "ok": true,
        "governanceRequired": true,
        "proposalId": proposal.id,
        "requiredApprovals": proposal.required_approvals,
    })))
}

pub async fn update_policy(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
    Json(body): Json<UpdatePolicyVersionRequest>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_policy_id(&id);
    let command = UpdatePolicyVersionCommand {
        label: body.label,
        policies: body.policies.as_ref().map(|rules| parse_policy_rules(rules)),
    };
    state
        .policy
        .update_version
        .execute(ctx, env, id, command)
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn delete_policy(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let id = parse_policy_id(&id);
    let deleted = state
        .policy
        .delete_version
        .execute(ctx, env, id)
        .await?;
    Ok(Json(json!({ "ok": true, "deleted": deleted })))
}

pub async fn activate_policy(
    State(state): State<AppState>,
    AuthSubject(ctx): AuthSubject,
    RequestEnvironment(env): RequestEnvironment,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, AppErrorResponse> {
    let tenant_id = ctx.tenant_id().as_str().to_string();
    let policy_id = parse_policy_id(&id);
    let payload = json!({ "policyVersionId": policy_id.as_str() });
    let proposal = state
        .governance
        .create
        .execute(
            ctx,
            env,
            application::dto::governance::CreateGovernanceProposalCommand {
                proposal_type: "policy.activate".into(),
                tenant_id,
                payload,
            },
        )
        .await?;
    Ok(Json(json!({
        "ok": true,
        "governanceRequired": true,
        "proposalId": proposal.id,
        "requiredApprovals": proposal.required_approvals,
    })))
}
