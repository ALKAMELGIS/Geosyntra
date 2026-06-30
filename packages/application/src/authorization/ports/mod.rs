use super::{
    engine::{AuthorizationContext, AuthorizationEngine},
    AccessDecision,
};

pub trait AuthorizationService: Send + Sync {
    fn authorize(&self, ctx: &AuthorizationContext) -> AccessDecision;
}

impl AuthorizationService for AuthorizationEngine {
    fn authorize(&self, ctx: &AuthorizationContext) -> AccessDecision {
        self.evaluate(ctx)
    }
}
