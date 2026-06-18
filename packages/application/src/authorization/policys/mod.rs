
pub mod rbac_mapping;
pub mod rbac_permission;

use crate::error::{AppError, AppResult};

use super::{
    action::AuthorizationAction,
    attributes::{AttributeKey, AttributeValue, AuthorizationAttributes},
    engine::AuthorizationContext,
    relation::{AuthorizationRelation, AuthorizationRelations},
    resource_type::AuthorizationResourceType,
    AccessDecision,
};

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct ApplicationPolicyId(String);

impl ApplicationPolicyId {
    pub fn new(id: &str) -> Self {
        Self(id.to_string())
    }
    pub fn id(&self) -> String {
        self.0.clone()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for ApplicationPolicyId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


impl std::fmt::Display for ApplicationPolicyId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct ApplicationPolicyPriority(i32);

impl ApplicationPolicyPriority {
    pub fn new(id: i32) -> Self {
        Self(id)
    }
    pub fn id(&self) -> i32 {
        self.0
    }
}

impl std::ops::Deref for ApplicationPolicyPriority {
    type Target = i32;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}


impl std::fmt::Display for ApplicationPolicyPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone)]
pub enum ApplicationPolicyEffect {
    Allow,
    Deny,
}

#[derive(Debug, Clone)]
pub struct ApplicationStoredPolicy {
    pub id: ApplicationPolicyId,
    pub version_id: Option<String>,

    pub resource_type: AuthorizationResourceType,
    pub action: AuthorizationAction,

    pub required_relations: AuthorizationRelations,

    pub required_subject_attributes: AuthorizationAttributes,
    pub required_resource_attributes: AuthorizationAttributes,

    pub effect: ApplicationPolicyEffect,
    pub priority: ApplicationPolicyPriority,
}

impl ApplicationStoredPolicy {
    pub fn new(
        id: ApplicationPolicyId,
        priority: ApplicationPolicyPriority,
    ) -> ApplicationStoredPolicyBuilder {
        ApplicationStoredPolicyBuilder::new(id, priority)
    }
}
impl ApplicationAuthorizationPolicy for ApplicationStoredPolicy {
    fn evaluate(&self, ctx: &AuthorizationContext) -> Option<AccessDecision> {
        // Match resource type
        if ctx.resource_type.as_str() != self.resource_type.resource_type() {
            return None;
        }

        // Match action
        if ctx.action.as_str() != self.action.action() {
            return None;
        }

        // Match relations
        for relation in self.required_relations.iter() {
            if !ctx
                .relations
                .contains(&AuthorizationRelation::new(relation))
            {
                return None;
            }
        }

        // Match subject attributes
        for (key, value) in self.required_subject_attributes.iter() {
            let attr = ctx.subject_attributes.get(&AttributeKey::new(key));
            if attr != Some(&value.clone()) {
                return None;
            }
        }

        // Match resource attributes
        for (key, value) in self.required_resource_attributes.iter() {
            let attr = ctx.resource_attributes.get(&AttributeKey::new(key));
            if attr != Some(&value.clone()) {
                return None;
            }
        }

        // If all matched, return effect
        match self.effect {
            ApplicationPolicyEffect::Allow => Some(AccessDecision::Allow),
            ApplicationPolicyEffect::Deny => Some(AccessDecision::Deny),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ApplicationStoredPolicyBuilder {
    id: ApplicationPolicyId,
    resource_type: Option<AuthorizationResourceType>,
    action: Option<AuthorizationAction>,

    required_relations: AuthorizationRelations,

    required_subject_attributes: AuthorizationAttributes,
    required_resource_attributes: AuthorizationAttributes,

    effect: ApplicationPolicyEffect,
    priority: ApplicationPolicyPriority,
}

impl ApplicationStoredPolicyBuilder {
    pub fn new(id: ApplicationPolicyId, priority: ApplicationPolicyPriority) -> Self {
        Self {
            id,
            resource_type: None,
            action: None,
            required_relations: AuthorizationRelations::new(),
            required_subject_attributes: AuthorizationAttributes::new(),
            required_resource_attributes: AuthorizationAttributes::new(),
            effect: ApplicationPolicyEffect::Deny,
            priority,
        }
    }

    pub fn set_resource_type(&mut self, resource_type: AuthorizationResourceType) -> &mut Self {
        self.resource_type = Some(resource_type);
        self
    }

    pub fn set_action(&mut self, action: AuthorizationAction) -> &mut Self {
        self.action = Some(action);
        self
    }

    pub fn set_effect(&mut self, effect: ApplicationPolicyEffect) -> &mut Self {
        self.effect = effect;
        self
    }
    pub fn add_required_relations(
        &mut self,
        required_relations: AuthorizationRelations,
    ) -> &mut Self {
        self.required_relations.add_relations(required_relations);
        self
    }

    pub fn add_required_relation(&mut self, required_relation: AuthorizationRelation) -> &mut Self {
        self.required_relations.add_relation(required_relation);
        self
    }
    pub fn add_required_subject_attributes(
        &mut self,
        required_subject_attributes: AuthorizationAttributes,
    ) -> &mut Self {
        self.required_subject_attributes
            .add_attributes(required_subject_attributes);
        self
    }

    pub fn add_required_subject_attribute(
        &mut self,
        required_subject_attribute: (AttributeKey, AttributeValue),
    ) -> &mut Self {
        self.required_subject_attributes
            .add_attribute(required_subject_attribute);
        self
    }

    pub fn add_required_resource_attributes(
        &mut self,
        required_resource_attributes: AuthorizationAttributes,
    ) -> &mut Self {
        self.required_resource_attributes
            .add_attributes(required_resource_attributes);
        self
    }

    pub fn add_required_resource_attribute(
        &mut self,
        required_resource_attribute: (AttributeKey, AttributeValue),
    ) -> &mut Self {
        self.required_resource_attributes
            .add_attribute(required_resource_attribute);
        self
    }

    pub fn add_required_attributes_from_json(
        &mut self,
        subject: AuthorizationAttributes,
        resource: AuthorizationAttributes,
    ) -> &mut Self {
        self.required_subject_attributes.add_attributes(subject);
        self.required_resource_attributes.add_attributes(resource);
        self
    }

    pub fn build(self) -> AppResult<ApplicationStoredPolicy> {
        Ok(ApplicationStoredPolicy {
            id: self.id,
            version_id: None,
            resource_type: self
                .resource_type
                .ok_or(AppError::PolicyError("empty resorce type".to_string()))?,
            action: self
                .action
                .ok_or(AppError::PolicyError("empty action".to_string()))?,
            required_relations: self.required_relations,
            required_subject_attributes: self.required_subject_attributes,
            required_resource_attributes: self.required_resource_attributes,
            effect: self.effect,
            priority: self.priority,
        })
    }
}

pub trait ApplicationAuthorizationPolicy: Send + Sync {
    fn evaluate(&self, ctx: &AuthorizationContext) -> Option<AccessDecision>;
}
