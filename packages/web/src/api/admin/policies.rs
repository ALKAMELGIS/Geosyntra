use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct PolicyVersionSummary {
    pub id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    pub version: u32,
    pub label: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "policyCount")]
    pub policy_count: u32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "activatedAt")]
    pub activated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
pub struct PolicyRule {
    pub id: String,
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    pub action: String,
    pub effect: String,
    pub priority: i32,
    #[serde(default, rename = "requiredRelations")]
    pub required_relations: Vec<String>,
    #[serde(default, rename = "requiredSubjectAttributes")]
    pub required_subject_attributes: serde_json::Value,
    #[serde(default, rename = "requiredResourceAttributes")]
    pub required_resource_attributes: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct PolicyVersionDetail {
    pub id: String,
    #[serde(rename = "tenantId")]
    pub tenant_id: String,
    pub version: u32,
    pub label: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub policies: Vec<PolicyRule>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "activatedAt")]
    pub activated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListPoliciesResponse {
    versions: Vec<PolicyVersionSummary>,
}

#[derive(Debug, Deserialize)]
struct GetPolicyResponse {
    version: PolicyVersionDetail,
}

#[derive(Debug, Deserialize)]
struct CreatePolicyResponse {
    id: String,
}

pub async fn list_policies(token: &str) -> Result<Vec<PolicyVersionSummary>, ApiError> {
    let client = ApiClient::from_env();
    let data: ListPoliciesResponse = client
        .get_json("/api/rbac/policies", Some(token))
        .await?;
    Ok(data.versions)
}

pub async fn get_policy(token: &str, id: &str) -> Result<PolicyVersionDetail, ApiError> {
    let client = ApiClient::from_env();
    let data: GetPolicyResponse = client
        .get_json(&format!("/api/rbac/policies/{id}"), Some(token))
        .await?;
    Ok(data.version)
}

pub async fn create_policy(
    token: &str,
    label: &str,
    policies: &[PolicyRule],
) -> Result<serde_json::Value, ApiError> {
    let client = ApiClient::from_env();
    let body = json!({
        "label": label,
        "policies": policies,
    });
    client
        .post_json("/api/rbac/policies", &body, Some(token))
        .await
}

pub async fn update_policy(
    token: &str,
    id: &str,
    label: Option<&str>,
    policies: Option<&[PolicyRule]>,
) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let mut body = json!({});
    if let Some(label) = label {
        body["label"] = json!(label);
    }
    if let Some(policies) = policies {
        body["policies"] = json!(policies);
    }
    let _: serde_json::Value = client
        .patch_json(&format!("/api/rbac/policies/{id}"), &body, Some(token))
        .await?;
    Ok(())
}

pub async fn delete_policy(token: &str, id: &str) -> Result<bool, ApiError> {
    let client = ApiClient::from_env();
    #[derive(Deserialize)]
    struct DeleteResponse {
        deleted: bool,
    }
    let data: DeleteResponse = client
        .delete_json(&format!("/api/rbac/policies/{id}"), Some(token))
        .await?;
    Ok(data.deleted)
}

pub async fn activate_policy(token: &str, id: &str) -> Result<(), ApiError> {
    let client = ApiClient::from_env();
    let _: serde_json::Value = client
        .post_empty(&format!("/api/rbac/policies/{id}/activate"), Some(token))
        .await?;
    Ok(())
}

impl PolicyRule {
    pub fn new_draft(resource_type: &str, action: &str) -> Self {
        Self {
            id: format!("pol-{}", uuid_simple()),
            resource_type: resource_type.into(),
            action: action.into(),
            effect: "allow".into(),
            priority: 100,
            required_relations: Vec::new(),
            required_subject_attributes: json!({}),
            required_resource_attributes: json!({}),
        }
    }

    pub fn relations_text(&self) -> String {
        self.required_relations.join(", ")
    }

    pub fn set_relations_text(&mut self, raw: &str) {
        self.required_relations = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }

    pub fn subject_attrs_text(&self) -> String {
        serde_json::to_string(&self.required_subject_attributes).unwrap_or_else(|_| "{}".into())
    }

    pub fn resource_attrs_text(&self) -> String {
        serde_json::to_string(&self.required_resource_attributes).unwrap_or_else(|_| "{}".into())
    }

    pub fn set_subject_attrs_text(&mut self, raw: &str) {
        if let Ok(v) = serde_json::from_str(raw) {
            self.required_subject_attributes = v;
        }
    }

    pub fn set_resource_attrs_text(&mut self, raw: &str) {
        if let Ok(v) = serde_json::from_str(raw) {
            self.required_resource_attributes = v;
        }
    }
}

fn uuid_simple() -> String {
    format!("{:x}", crate::wall_clock::now_ms())
}

#[cfg(test)]
mod tests {
    use super::PolicyRule;

    #[test]
    fn draft_rule_defaults_to_allow() {
        let rule = PolicyRule::new_draft("user", "read");
        assert_eq!(rule.effect, "allow");
        assert_eq!(rule.resource_type, "user");
    }
}
