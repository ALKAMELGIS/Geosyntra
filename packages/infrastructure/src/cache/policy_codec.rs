use application::{
    authorization::policys::{
        ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
        ApplicationStoredPolicy,
    },
    error::{AppError, AppResult},
};
use application::authorization::{
    action::AuthorizationAction, resource_type::AuthorizationResourceType,
};

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct PolicyWire {
    id: String,
    resource_type: String,
    action: String,
    effect: String,
    priority: i32,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct TenantPoliciesWire {
    pub fingerprint: String,
    pub policies: Vec<PolicyWire>,
}

pub fn encode_tenant_policies(
    fingerprint: &str,
    policies: &[ApplicationStoredPolicy],
) -> AppResult<String> {
    let wire = TenantPoliciesWire {
        fingerprint: fingerprint.to_string(),
        policies: policies.iter().map(to_wire).collect(),
    };
    serde_json::to_string(&wire).map_err(|e| AppError::Repository(e.to_string()))
}

pub fn decode_tenant_policies(json: &str) -> AppResult<CachedTenantPolicies> {
    let wire: TenantPoliciesWire =
        serde_json::from_str(json).map_err(|e| AppError::Repository(e.to_string()))?;
    let policies = wire
        .policies
        .into_iter()
        .map(from_wire)
        .collect::<AppResult<Vec<_>>>()?;
    Ok(CachedTenantPolicies {
        fingerprint: wire.fingerprint,
        policies,
    })
}

use application::ports::CachedTenantPolicies;

fn to_wire(p: &ApplicationStoredPolicy) -> PolicyWire {
    PolicyWire {
        id: p.id.as_str().to_string(),
        resource_type: p.resource_type.to_string(),
        action: p.action.to_string(),
        effect: match p.effect {
            ApplicationPolicyEffect::Allow => "allow",
            ApplicationPolicyEffect::Deny => "deny",
        }
        .to_string(),
        priority: p.priority.id(),
    }
}

fn from_wire(w: PolicyWire) -> AppResult<ApplicationStoredPolicy> {
    let effect = match w.effect.as_str() {
        "allow" => ApplicationPolicyEffect::Allow,
        "deny" => ApplicationPolicyEffect::Deny,
        _ => return Err(AppError::Repository("invalid_policy_effect".into())),
    };
    let mut builder = ApplicationStoredPolicy::new(
        ApplicationPolicyId::new(&w.id),
        ApplicationPolicyPriority::new(w.priority),
    );
    builder
        .set_resource_type(AuthorizationResourceType::new(&w.resource_type))
        .set_action(AuthorizationAction::new(&w.action))
        .set_effect(effect);
    builder.build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use application::authorization::policys::{
        ApplicationPolicyEffect, ApplicationPolicyId, ApplicationPolicyPriority,
        ApplicationStoredPolicy,
    };

    fn sample_policy(id: &str) -> ApplicationStoredPolicy {
        let mut builder = ApplicationStoredPolicy::new(
            ApplicationPolicyId::new(id),
            ApplicationPolicyPriority::new(50),
        );
        builder
            .set_resource_type(AuthorizationResourceType::new("user"))
            .set_action(AuthorizationAction::new("read"))
            .set_effect(ApplicationPolicyEffect::Allow);
        builder.build().unwrap()
    }

    #[test]
    fn encode_decode_roundtrip_preserves_policy_fields() {
        let policies = vec![sample_policy("p1"), sample_policy("p2")];
        let fp = "2:p1,p2";
        let json = encode_tenant_policies(fp, &policies).unwrap();
        let decoded = decode_tenant_policies(&json).unwrap();
        assert_eq!(decoded.fingerprint, fp);
        assert_eq!(decoded.policies.len(), 2);
        assert_eq!(decoded.policies[0].id.as_str(), "p1");
        assert!(matches!(
            decoded.policies[0].effect,
            ApplicationPolicyEffect::Allow
        ));
    }

    #[test]
    fn decode_rejects_invalid_effect() {
        let json = r#"{"fingerprint":"x","policies":[{"id":"p","resource_type":"user","action":"read","effect":"maybe","priority":1}]}"#;
        assert!(decode_tenant_policies(json).is_err());
    }
}
