use application::{
    authorization::{
        attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
        policys::{
            ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
            ApplicationStoredPolicy,
        },
    },
    dto::policy::{PolicyVersionId, PolicyVersionSummaryView, PolicyVersionView},
};
use serde_json::{json, Value};

pub fn policy_summary_to_json(view: &PolicyVersionSummaryView) -> Value {
    json!({
        "id": view.id.as_str(),
        "tenantId": view.tenant_id.as_str(),
        "version": view.version,
        "label": view.label,
        "isActive": view.is_active,
        "policyCount": view.policy_count,
        "createdAt": view.created_at.datetime(),
        "activatedAt": view.activated_at.as_ref().map(|t| t.datetime()),
    })
}

pub fn policy_version_to_json(view: &PolicyVersionView) -> Value {
    json!({
        "id": view.id.as_str(),
        "tenantId": view.tenant_id.as_str(),
        "version": view.version,
        "label": view.label,
        "isActive": view.is_active,
        "policies": view.policies.iter().map(stored_policy_to_json).collect::<Vec<_>>(),
        "createdAt": view.created_at.datetime(),
        "activatedAt": view.activated_at.as_ref().map(|t| t.datetime()),
    })
}

pub fn stored_policy_to_json(policy: &ApplicationStoredPolicy) -> Value {
    let relations: Vec<String> = policy
        .required_relations
        .iter()
        .map(|r| r.relation())
        .collect();
    json!({
        "id": policy.id.as_str(),
        "resourceType": policy.resource_type.resource_type(),
        "action": policy.action.action(),
        "effect": effect_str(&policy.effect),
        "priority": *policy.priority,
        "requiredRelations": relations,
        "requiredSubjectAttributes": attrs_to_json(&policy.required_subject_attributes),
        "requiredResourceAttributes": attrs_to_json(&policy.required_resource_attributes),
    })
}

fn attrs_to_json(attrs: &AuthorizationAttributes) -> Value {
    let mut obj = serde_json::Map::new();
    for (key, value) in attrs.iter() {
        obj.insert(key.attribute_key(), attr_value_to_json(value));
    }
    Value::Object(obj)
}

fn attr_value_to_json(value: &AttributeValue) -> Value {
    match value {
        AttributeValue::String(s) => Value::String(s.clone()),
        AttributeValue::Bool(b) => Value::Bool(*b),
        AttributeValue::Number(n) => json!(n),
        AttributeValue::StringList(items) => json!(items),
    }
}

fn effect_str(effect: &ApplicationPolicyEffect) -> &'static str {
    match effect {
        ApplicationPolicyEffect::Allow => "allow",
        ApplicationPolicyEffect::Deny => "deny",
    }
}

pub fn parse_policy_id(raw: &str) -> PolicyVersionId {
    PolicyVersionId::new(raw)
}

pub fn parse_policy_rules(
    rules: &[PolicyRuleJson],
) -> Vec<application::dto::policy::PolicyRuleCommand> {
    rules.iter().map(parse_policy_rule).collect()
}

pub fn parse_policy_rule(rule: &PolicyRuleJson) -> application::dto::policy::PolicyRuleCommand {
    use application::dto::policy::PolicyRuleCommand;

    let id = rule
        .id
        .as_deref()
        .map(ApplicationPolicyId::new)
        .unwrap_or_else(|| ApplicationPolicyId::new(&format!("pol-{}", uuid::Uuid::new_v4())));

    let effect = match rule.effect.to_ascii_lowercase().as_str() {
        "allow" => ApplicationPolicyEffect::Allow,
        _ => ApplicationPolicyEffect::Deny,
    };

    PolicyRuleCommand {
        id,
        resource_type: rule.resource_type.clone(),
        action: rule.action.clone(),
        effect,
        priority: ApplicationPolicyPriority::new(rule.priority),
        required_relations: rule.required_relations.clone(),
        required_subject_attributes: rule
            .required_subject_attributes
            .clone()
            .unwrap_or_else(|| json!({})),
        required_resource_attributes: rule
            .required_resource_attributes
            .clone()
            .unwrap_or_else(|| json!({})),
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct PolicyRuleJson {
    pub id: Option<String>,
    #[serde(alias = "resourceType")]
    pub resource_type: String,
    pub action: String,
    #[serde(default = "default_effect")]
    pub effect: String,
    #[serde(default)]
    pub priority: i32,
    #[serde(default, alias = "requiredRelations")]
    pub required_relations: Vec<String>,
    #[serde(default, alias = "requiredSubjectAttributes")]
    pub required_subject_attributes: Option<Value>,
    #[serde(default, alias = "requiredResourceAttributes")]
    pub required_resource_attributes: Option<Value>,
}

fn default_effect() -> String {
    "allow".into()
}
