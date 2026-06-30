use super::{
    engine::AuthorizationContext,
    policys::ApplicationAuthorizationPolicy,
    AccessDecision,
};

/// Test/dev policy — always allow. Production uses stored policies seeded from Express MATRIX (Task 10).
pub struct AllowAllPolicy;

impl ApplicationAuthorizationPolicy for AllowAllPolicy {
    fn evaluate(&self, _ctx: &AuthorizationContext) -> Option<AccessDecision> {
        Some(AccessDecision::Allow)
    }
}
