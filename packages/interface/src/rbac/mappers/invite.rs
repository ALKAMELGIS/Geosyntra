use application::dto::invite::RoleInviteView;
use application::rbac::{normalize_rbac_role, rbac_role_to_display};
use serde_json::{json, Value};

pub fn invite_to_json(invite: &RoleInviteView) -> Value {
    let role_slug = invite
        .role_slug
        .as_deref()
        .map(normalize_rbac_role)
        .unwrap_or("trial_user");
    json!({
        "email": invite.email.as_ref().map(|e| e.email()),
        "role": invite.role_display.as_deref().unwrap_or_else(|| rbac_role_to_display(role_slug)),
        "roleSlug": role_slug,
        "status": invite.status,
        "expiresAt": invite.expires_at.as_ref().map(|t| t.datetime()),
        "acceptedAt": invite.accepted_at.as_ref().map(|t| t.datetime()),
        "createdAt": invite.created_at.as_ref().map(|t| t.datetime()),
    })
}

pub fn invite_preview_json(invite: &RoleInviteView) -> Value {
    let role_slug = invite
        .role_slug
        .as_deref()
        .map(normalize_rbac_role)
        .unwrap_or("trial_user");
    json!({
        "email": invite.email.as_ref().map(|e| e.email()),
        "role": invite.role_display.as_deref().unwrap_or_else(|| rbac_role_to_display(role_slug)),
        "roleSlug": role_slug,
        "expiresAt": invite.expires_at.as_ref().map(|t| t.datetime()),
    })
}
