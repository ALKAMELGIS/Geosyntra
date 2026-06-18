use domain::Membership;

use crate::{
    authorization::access_descriptor::AccessControl,
    dto::tenant::view::MembershipView,
    projection::fields::membership::MembershipField,
};

pub struct MembershipProjector;

impl MembershipProjector {
    pub fn from_domain(membership: &Membership) -> MembershipView {
        let parts = membership.clone().into_parts();
        MembershipView {
            user_id: Some(parts.user_id),
            tenant_id: Some(parts.tenant_id),
            roles: Some(parts.roles),
            created_at: Some(parts.created_at),
            version: Some(parts.version),
        }
    }

    pub fn apply_access(view: &mut MembershipView, access: &AccessControl<MembershipField>) {
        if !access.can_read {
            *view = MembershipView::default();
            return;
        }
        let readable = &access.readable_fields;
        if !readable.contains(&MembershipField::UserId) {
            view.user_id = None;
        }
        if !readable.contains(&MembershipField::TenantId) {
            view.tenant_id = None;
        }
        if !readable.contains(&MembershipField::Roles) {
            view.roles = None;
        }
        if !readable.contains(&MembershipField::CreatedAt) {
            view.created_at = None;
        }
        if !readable.contains(&MembershipField::Version) {
            view.version = None;
        }
    }

    pub fn present(mut view: MembershipView, access: &AccessControl<MembershipField>) -> MembershipView {
        Self::apply_access(&mut view, access);
        view
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use domain::{DateTime, RoleId, TenantId, UserId};

    use super::*;

    #[test]
    fn membership_projector_masks_denied_fields() {
        let view = MembershipView {
            user_id: Some(UserId::new("u1")),
            tenant_id: Some(TenantId::new("t1")),
            roles: Some(HashSet::from([RoleId::new("admin")])),
            created_at: Some(DateTime::new(0)),
            version: Some(1),
        };
        let mut readable = HashSet::new();
        readable.insert(MembershipField::UserId);
        readable.insert(MembershipField::TenantId);
        let access = AccessControl::new(true, readable, HashSet::new());
        let presented = MembershipProjector::present(view, &access);
        assert!(presented.user_id.is_some());
        assert!(presented.roles.is_none());
    }
}
