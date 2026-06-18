use application::{
    dto::user::view::UserView,
    rbac::{permissions_for_role, DEFAULT_TENANT_ID},
};
use domain::user::UserStatus;

use crate::auth::handlers::PublicUserJson;

pub fn user_view_to_public(view: UserView) -> PublicUserJson {
    let first_name = view
        .profile
        .as_ref()
        .and_then(|p| p.first_name.as_ref().map(|n| n.name().to_string()));
    let last_name = view
        .profile
        .as_ref()
        .and_then(|p| p.last_name.as_ref().map(|n| n.name().to_string()));
    let display_name = first_name.clone().or_else(|| view.email.as_ref().map(|e| e.email().to_string()));
    PublicUserJson {
        id: view.id.map(|id| id.as_str().to_string()),
        email: view.email.map(|e| e.email().to_string()),
        name: display_name,
        first_name,
        last_name,
        username: view.username.map(|u| u.username().to_string()),
        bio: view
            .profile
            .as_ref()
            .and_then(|p| p.bio.as_ref().map(|b| b.bio().to_string())),
        phone_number: view.profile.as_ref().and_then(|p| {
            p.phone_numbers.as_ref().and_then(|phones| {
                phones.iter().next().map(|n| n.number().to_string())
            })
        }),
        website: view
            .profile
            .as_ref()
            .and_then(|p| p.website.as_ref().map(|u| u.url().to_string())),
        avatar_url: view
            .profile
            .as_ref()
            .and_then(|p| p.avatar_url.as_ref().map(|u| u.url().to_string())),
        email_notifications: view
            .preferences
            .as_ref()
            .and_then(|p| p.email_notifications),
        push_notifications: view
            .preferences
            .as_ref()
            .and_then(|p| p.push_notifications),
        two_factor_auth: view.preferences.as_ref().and_then(|p| p.two_factor_auth),
        language: view
            .preferences
            .as_ref()
            .and_then(|p| p.language.as_ref().map(|l| l.language().to_string())),
        role: view.role,
        role_slug: view.role_slug.clone(),
        status: view.status.map(status_display),
        tenant_id: Some(DEFAULT_TENANT_ID.to_string()),
        permissions: view
            .role_slug
            .as_deref()
            .map(permissions_for_role)
            .map(|slugs| slugs.iter().map(|s| (*s).to_string()).collect())
            .unwrap_or_default(),
    }
}

fn status_display(status: UserStatus) -> String {
    match status {
        UserStatus::Active => "Active".into(),
        UserStatus::Suspended => "Suspended".into(),
        UserStatus::Banned => "Banned".into(),
        UserStatus::Inactive => "Inactive".into(),
    }
}
