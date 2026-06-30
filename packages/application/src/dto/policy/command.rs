use domain::DateTime;

use crate::authorization::policys::{
    ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
};

#[derive(Debug, Clone)]
pub struct PolicyRuleCommand {
    pub id: ApplicationPolicyId,
    pub resource_type: String,
    pub action: String,
    pub effect: ApplicationPolicyEffect,
    pub priority: ApplicationPolicyPriority,
    pub required_relations: Vec<String>,
    pub required_subject_attributes: serde_json::Value,
    pub required_resource_attributes: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct CreatePolicyVersionCommand {
    pub version: u32,
    pub label: String,
    pub policies: Vec<PolicyRuleCommand>,
}

#[derive(Debug, Clone)]
pub struct UpdatePolicyVersionCommand {
    pub label: Option<String>,
    pub policies: Option<Vec<PolicyRuleCommand>>,
}

#[derive(Debug, Clone)]
pub struct ActivatePolicyVersionCommand {
    pub activated_at: DateTime,
}
