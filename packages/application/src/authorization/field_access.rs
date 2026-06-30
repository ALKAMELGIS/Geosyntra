use std::collections::HashSet;
use std::hash::Hash;

use domain::traits::field::Field;

use crate::error::AppResult;

use super::{access_descriptor::AccessControl, engine::AuthorizationContext, AccessDecision};

/// Phase 2 field authorization — derives readable/writable field sets from action decision + policy.
pub struct FieldAccessResolver;

impl FieldAccessResolver {
    pub fn resolve<F>(
        decision: AccessDecision,
        readable_fields: HashSet<F>,
    ) -> AppResult<AccessControl<F>>
    where
        F: Field + Eq + Hash + Copy,
    {
        if matches!(decision, AccessDecision::Deny) {
            return Ok(AccessControl::new(
                false,
                HashSet::new(),
                HashSet::new(),
            ));
        }

        Ok(AccessControl::new(true, readable_fields, HashSet::new()))
    }

    /// Convenience when only action decision and pre-resolved readable set are known.
    pub fn from_context<F>(
        ctx: &AuthorizationContext,
        readable_fields: HashSet<F>,
    ) -> AppResult<AccessControl<F>>
    where
        F: Field + Eq + Hash + Copy,
    {
        let decision = if ctx.subject.roles().is_empty()
            && ctx.subject.temporary_grants().is_empty()
        {
            AccessDecision::Deny
        } else {
            AccessDecision::Allow
        };
        Self::resolve(decision, readable_fields)
    }
}
