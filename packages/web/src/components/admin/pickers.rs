use dioxus::prelude::*;

use crate::api::admin::{roles::role_display_label, tenants::TenantRow, users::AdminUser};

use super::catalog::{tenant_label, user_label, GRANT_PRESETS};

#[component]
pub fn TenantSelect(
    tenants: Vec<TenantRow>,
    value: String,
    on_change: EventHandler<FormEvent>,
    #[props(default = "gs-admin-tenant".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "Tenant" }
            select {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                onchange: on_change,
                for t in tenants.iter() {
                    option {
                        key: "{t.id}",
                        value: "{t.id}",
                        selected: value == t.id,
                        "{tenant_label(t)}"
                    }
                }
            }
        }
    }
}

#[component]
pub fn MultiRoleSelect(
    role_slugs: Vec<String>,
    selected: Vec<String>,
    on_toggle: EventHandler<String>,
    #[props(default = "gs-admin-roles-multi".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "Roles" }
            div { id: "{field_id}", class: "gs-checkbox-group",
                for slug in role_slugs.iter() {
                    {
                        let checked = selected.iter().any(|s| s == slug);
                        let slug_for_click = slug.clone();
                        rsx! {
                            label { class: "gs-checkbox-row", key: "{slug}",
                                input {
                                    r#type: "checkbox",
                                    checked,
                                    onclick: move |_| on_toggle.call(slug_for_click.clone()),
                                }
                                " {role_display_label(slug)} ({slug})"
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn RoleSelect(
    role_slugs: Vec<String>,
    value: String,
    on_change: EventHandler<FormEvent>,
    #[props(default = "gs-admin-role".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field",
            label { r#for: "{field_id}", "Role" }
            select {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                onchange: on_change,
                for slug in role_slugs.iter() {
                    option {
                        key: "{slug}",
                        value: "{slug}",
                        selected: value == *slug,
                        "{role_display_label(slug)} ({slug})"
                    }
                }
            }
        }
    }
}

#[component]
pub fn UserSelect(
    users: Vec<AdminUser>,
    value: String,
    on_change: EventHandler<FormEvent>,
    placeholder: String,
    #[props(default = "gs-admin-user".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "User" }
            select {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                onchange: on_change,
                option { value: "", disabled: true, selected: value.is_empty(), "{placeholder}" }
                for user in users.iter() {
                    {
                        let id = user.id.clone().unwrap_or_default();
                        rsx! {
                            option {
                                key: "{id}",
                                value: "{id}",
                                selected: value == id,
                                "{user_label(user)}"
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn GrantPermissionSelect(
    value: String,
    on_change: EventHandler<FormEvent>,
    #[props(default = "gs-admin-grant-permission".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "Permission" }
            select {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                onchange: on_change,
                for preset in GRANT_PRESETS.iter() {
                    {
                        let key = format!("{}.{}", preset.resource, preset.action);
                        rsx! {
                            option {
                                key: "{key}",
                                value: "{key}",
                                selected: value == key,
                                "{preset.label} ({key})"
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn parse_grant_preset(value: &str) -> Option<(&'static str, &'static str)> {
    GRANT_PRESETS
        .iter()
        .find(|p| format!("{}.{}", p.resource, p.action) == value)
        .map(|p| (p.resource, p.action))
}

pub const GRANT_DURATIONS: &[(&str, i64)] = &[
    ("1 hour", 3_600),
    ("24 hours", 86_400),
    ("7 days", 604_800),
];

#[component]
pub fn GrantDurationSelect(
    value: String,
    on_change: EventHandler<FormEvent>,
    #[props(default = "gs-admin-grant-duration".to_string())] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field",
            label { r#for: "{field_id}", "Duration" }
            select {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                onchange: on_change,
                for (label, secs) in GRANT_DURATIONS.iter() {
                    {
                        let key = secs.to_string();
                        rsx! {
                            option {
                                key: "{key}",
                                value: "{key}",
                                selected: value == key,
                                "{label}"
                            }
                        }
                    }
                }
            }
        }
    }
}
