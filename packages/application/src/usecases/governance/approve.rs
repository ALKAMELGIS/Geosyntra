use std::sync::Arc;

use chrono::Utc;
use domain::{DateTime, Description, Name, TenantId};
use domain::tenant::environment::Environment;
use serde::Deserialize;

use crate::{
    authorization::{authorize_use_case, AuthorizationParams, ports::AuthorizationService},
    dto::{
        governance::GovernanceProposalView,
        policy::{ActivatePolicyVersionCommand, CreatePolicyVersionCommand, PolicyRuleCommand},
        tenant::command::TenantCommand,
    },
    error::{AppError, AppResult},
    ports::{AuditRepository, GovernanceRepository, PlatformConfigRepository, TenantBootstrapService, TenantRepository},
    usecases::{
        policy::{ActivatePolicyVersionUseCase, CreatePolicyVersionUseCase},
        usecase_descriptor::UseCaseDescriptor,
    },
    SubjectContext,
};

pub struct ApproveGovernanceProposalUseCase {
    repo: Arc<dyn GovernanceRepository>,
    audit: Arc<dyn AuditRepository>,
    auth: Arc<dyn AuthorizationService>,
    create_policy: Arc<CreatePolicyVersionUseCase>,
    activate_policy: Arc<ActivatePolicyVersionUseCase>,
    tenant_repo: Arc<dyn TenantRepository>,
    tenant_bootstrap: Arc<dyn TenantBootstrapService>,
    platform_config: Arc<dyn PlatformConfigRepository>,
}

impl ApproveGovernanceProposalUseCase {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        repo: Arc<dyn GovernanceRepository>,
        audit: Arc<dyn AuditRepository>,
        auth: Arc<dyn AuthorizationService>,
        create_policy: Arc<CreatePolicyVersionUseCase>,
        activate_policy: Arc<ActivatePolicyVersionUseCase>,
        tenant_repo: Arc<dyn TenantRepository>,
        tenant_bootstrap: Arc<dyn TenantBootstrapService>,
        platform_config: Arc<dyn PlatformConfigRepository>,
    ) -> Self {
        Self {
            repo,
            audit,
            auth,
            create_policy,
            activate_policy,
            tenant_repo,
            tenant_bootstrap,
            platform_config,
        }
    }

    pub async fn execute(
        &self,
        ctx: SubjectContext,
        environment: Environment,
        proposal_id: &str,
    ) -> AppResult<GovernanceProposalView> {
        let params = AuthorizationParams::new(&ctx, environment.clone())
            .with_resource_tenant_id(ctx.tenant_id());
        authorize_use_case::<Self>(self.auth.as_ref(), &params)?;

        let mut view = self.repo.approve(ctx.clone(), proposal_id).await?;

        let details = serde_json::json!({
            "proposal_id": view.id,
            "approver_id": ctx.user_id().as_str(),
            "count": view.approval_count,
            "required": view.required_approvals,
        })
        .to_string();

        self.audit
            .append(
                ctx.user_id().as_str(),
                "governance.approval.recorded",
                Some(proposal_id),
                Some(&details),
            )
            .await?;

        if view.status == "approved" {
            let result_id = apply_proposal(
                &view,
                ctx.clone(),
                environment,
                self.create_policy.as_ref(),
                self.activate_policy.as_ref(),
                self.tenant_repo.as_ref(),
                self.tenant_bootstrap.as_ref(),
                self.platform_config.as_ref(),
            )
            .await?;

            view = self
                .repo
                .mark_applied(proposal_id, result_id.as_deref())
                .await?;

            let apply_details = serde_json::json!({
                "proposal_id": view.id,
                "result_id": result_id,
            })
            .to_string();

            self.audit
                .append(
                    ctx.user_id().as_str(),
                    "governance.proposal.applied",
                    Some(proposal_id),
                    Some(&apply_details),
                )
                .await?;
        }

        Ok(view)
    }
}

impl UseCaseDescriptor for ApproveGovernanceProposalUseCase {
    const NAME: &'static str = "approve_governance_proposal";
    const RESOURCE: &'static str = "governance";
    const ACTION: &'static str = "approve";
}

async fn apply_proposal(
    proposal: &GovernanceProposalView,
    ctx: SubjectContext,
    environment: Environment,
    create_policy: &CreatePolicyVersionUseCase,
    activate_policy: &ActivatePolicyVersionUseCase,
    tenant_repo: &dyn TenantRepository,
    tenant_bootstrap: &dyn TenantBootstrapService,
    platform_config: &dyn PlatformConfigRepository,
) -> AppResult<Option<String>> {
    match proposal.proposal_type.as_str() {
        "policy.create" => {
            let payload: PolicyCreatePayload = serde_json::from_value(proposal.payload.clone())
                .map_err(|e| AppError::ValidationError(e.to_string()))?;
            let command = CreatePolicyVersionCommand {
                version: payload.version,
                label: payload.label,
                policies: payload
                    .policies
                    .iter()
                    .map(policy_rule_from_payload)
                    .collect(),
            };
            let tenant_ctx = ctx_with_tenant(ctx, &proposal.tenant_id)?;
            let id = create_policy
                .execute(tenant_ctx, environment, command)
                .await?;
            Ok(Some(id.as_str().to_string()))
        }
        "policy.activate" => {
            let payload: PolicyActivatePayload = serde_json::from_value(proposal.payload.clone())
                .map_err(|e| AppError::ValidationError(e.to_string()))?;
            let policy_version_id =
                crate::dto::policy::PolicyVersionId::new(payload.policy_version_id);
            let tenant_ctx = ctx_with_tenant(ctx, &proposal.tenant_id)?;
            let command = ActivatePolicyVersionCommand {
                activated_at: DateTime::new(Utc::now().timestamp()),
            };
            activate_policy
                .execute(tenant_ctx, environment, policy_version_id.clone(), command)
                .await?;
            Ok(Some(policy_version_id.as_str().to_string()))
        }
        "tenant.create" => {
            let payload: TenantCreatePayload = serde_json::from_value(proposal.payload.clone())
                .map_err(|e| AppError::ValidationError(e.to_string()))?;
            let tenant_ctx = ctx_with_tenant(ctx, crate::rbac::DEFAULT_TENANT_ID)?;
            let name = Name::new(&payload.name)
                .map_err(|e| AppError::Domain(e))?;
            tenant_repo
                .create(
                    tenant_ctx.clone(),
                    TenantCommand {
                        id: Some(TenantId::new(&payload.id)),
                        name: Some(name),
                        description: payload
                            .description
                            .as_deref()
                            .and_then(|d| Description::new(d).ok()),
                        created_at: None,
                        config: None,
                        version: None,
                    },
                )
                .await?;
            if payload.config.is_some() {
                tenant_repo
                    .merge_config(
                        tenant_ctx,
                        TenantId::new(&payload.id),
                        None,
                        payload.config.as_ref(),
                    )
                    .await?;
            }
            tenant_bootstrap.bootstrap_new_tenant(&payload.id).await?;
            Ok(Some(payload.id))
        }
        "tenant.update" => {
            let payload: TenantUpdatePayload = serde_json::from_value(proposal.payload.clone())
                .map_err(|e| AppError::ValidationError(e.to_string()))?;
            let tenant_ctx = ctx_with_tenant(ctx, crate::rbac::DEFAULT_TENANT_ID)?;
            let name = Name::new(&payload.name).map_err(AppError::Domain)?;
            tenant_repo
                .update(
                    tenant_ctx.clone(),
                    TenantCommand {
                        id: Some(TenantId::new(&payload.id)),
                        name: Some(name),
                        description: payload
                            .description
                            .as_deref()
                            .and_then(|d| Description::new(d).ok()),
                        created_at: None,
                        config: None,
                        version: None,
                    },
                )
                .await?;
            if payload.config.is_some() {
                tenant_repo
                    .merge_config(
                        tenant_ctx,
                        TenantId::new(&payload.id),
                        None,
                        payload.config.as_ref(),
                    )
                    .await?;
            }
            Ok(Some(payload.id))
        }
        "config.update" => {
            let payload: ConfigUpdatePayload = serde_json::from_value(proposal.payload.clone())
                .map_err(|e| AppError::ValidationError(e.to_string()))?;
            let patch = crate::platform_config::filter_allowlisted_patch(&payload.config)?;
            platform_config.merge_settings(&patch).await?;
            Ok(Some("platform.settings".into()))
        }
        other => Err(AppError::ValidationError(format!(
            "unsupported_proposal_type:{other}"
        ))),
    }
}

fn ctx_with_tenant(ctx: SubjectContext, tenant_id: &str) -> AppResult<SubjectContext> {
    Ok(SubjectContext::new(
        ctx.user_id().clone(),
        TenantId::new(tenant_id),
        ctx.roles(),
        ctx.temporary_grants(),
    ))
}

#[derive(Debug, Deserialize)]
struct PolicyCreatePayload {
    version: u32,
    label: String,
    #[serde(default)]
    policies: Vec<PolicyRuleJsonPayload>,
}

#[derive(Debug, Deserialize)]
struct PolicyRuleJsonPayload {
    id: Option<String>,
    resource_type: String,
    action: String,
    #[serde(default = "default_allow_effect")]
    effect: String,
    #[serde(default)]
    priority: i32,
    #[serde(default)]
    required_relations: Vec<String>,
    #[serde(default)]
    required_subject_attributes: serde_json::Value,
    #[serde(default)]
    required_resource_attributes: serde_json::Value,
}

fn default_allow_effect() -> String {
    "allow".into()
}

fn policy_rule_from_payload(rule: &PolicyRuleJsonPayload) -> PolicyRuleCommand {
    let id = rule.id.as_deref().map(crate::authorization::policys::ApplicationPolicyId::new);
    let id = id.unwrap_or_else(|| {
        let generated = format!("pol-{}", uuid::Uuid::new_v4());
        crate::authorization::policys::ApplicationPolicyId::new(&generated)
    });
    let effect = match rule.effect.to_ascii_lowercase().as_str() {
        "allow" => crate::authorization::policys::ApplicationPolicyEffect::Allow,
        _ => crate::authorization::policys::ApplicationPolicyEffect::Deny,
    };
    PolicyRuleCommand {
        id,
        resource_type: rule.resource_type.clone(),
        action: rule.action.clone(),
        effect,
        priority: crate::authorization::policys::ApplicationPolicyPriority::new(rule.priority),
        required_relations: rule.required_relations.clone(),
        required_subject_attributes: rule.required_subject_attributes.clone(),
        required_resource_attributes: rule.required_resource_attributes.clone(),
    }
}

#[derive(Debug, Deserialize)]
struct PolicyActivatePayload {
    #[serde(alias = "policyVersionId")]
    policy_version_id: String,
}

#[derive(Debug, Deserialize)]
struct ConfigUpdatePayload {
    config: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct TenantCreatePayload {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    config: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct TenantUpdatePayload {
    id: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    config: Option<serde_json::Value>,
}
