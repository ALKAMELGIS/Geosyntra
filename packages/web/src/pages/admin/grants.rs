use dioxus::prelude::*;

use crate::{
    api::admin::{
        bearer_token,
        grants::{self, GrantRow},
        tenants::TenantRow,
        users::AdminUser,
    },
    auth_session::AuthContext,
    components::admin::{
        load_catalog, user_label, AdminDetailModal, AdminShell, AdminStepperModal,
        GrantDurationSelect, GrantPermissionSelect, parse_grant_preset, TenantSelect,
        TextAreaField, UserSelect, GRANT_DURATIONS,
    },
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn grant_detail_fields(row: &GrantRow, user_name: &str) -> Vec<(String, String)> {
    vec![
        ("Grant id".into(), row.id.clone()),
        ("User".into(), user_name.to_string()),
        ("User id".into(), row.user_id.clone()),
        ("Resource".into(), row.resource.clone()),
        ("Action".into(), row.action.clone()),
        (
            "Expires".into(),
            row.expires_at
                .map(|t| t.to_string())
                .unwrap_or_else(|| "—".into()),
        ),
        (
            "Description".into(),
            if row.description.is_empty() {
                "—".into()
            } else {
                row.description.clone()
            },
        ),
    ]
}

#[component]
pub fn AdminGrants() -> Element {
    let auth = AuthContext::use_auth();
    let default_tenant = auth.session.read().active_tenant().to_string();
    let mut tenants_list = use_signal(Vec::<TenantRow>::new);
    let mut users_list = use_signal(Vec::<AdminUser>::new);
    let mut tenant_id = use_signal(move || default_tenant.clone());
    let mut rows = use_signal(Vec::<GrantRow>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    let mut create_open = use_signal(|| false);
    let mut create_step = use_signal(|| 1_u32);
    let mut create_tenant = use_signal(String::new);
    let mut create_user = use_signal(String::new);
    let mut permission_key = use_signal(|| "admin_users.read".to_string());
    let mut duration_secs = use_signal(|| GRANT_DURATIONS[1].1.to_string());
    let mut description = use_signal(String::new);

    let mut view_row = use_signal(|| None::<GrantRow>);

    let mut reload = move || {
        let tid = tenant_id.read().clone();
        if tid.is_empty() {
            loading.set(false);
            return;
        }
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match grants::list_grants(&token, &tid).await {
                    Ok(list) => {
                        rows.set(list);
                        loading.set(false);
                    }
                    Err(err) => {
                        error.set(Some(display_api_error(&err)));
                        loading.set(false);
                    }
                },
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                }
            }
        });
    };

    use_effect(move || {
        spawn(async move {
            match token_from(&auth) {
                Ok(token) => {
                    if let Ok(catalog) = load_catalog(&token).await {
                        tenants_list.set(catalog.tenants.clone());
                        users_list.set(catalog.users.clone());
                        if tenant_id.read().is_empty() {
                            if let Some(t) = catalog.tenants.first() {
                                tenant_id.set(t.id.clone());
                            }
                        }
                        create_tenant.set(tenant_id.read().clone());
                    }
                }
                Err(err) => error.set(Some(display_api_error(&err))),
            }
        });
    });

    use_effect(move || {
        reload();
    });

    let mut reset_create = move || {
        create_open.set(false);
        create_step.set(1);
        create_user.set(String::new());
        create_tenant.set(tenant_id.read().clone());
        permission_key.set("admin_users.read".into());
        duration_secs.set(GRANT_DURATIONS[1].1.to_string());
        description.set(String::new());
    };

    let on_create = move |_| {
        let tid = create_tenant.read().clone();
        let uid = create_user.read().clone();
        let perm = permission_key.read().clone();
        let secs: i64 = duration_secs
            .read()
            .parse()
            .unwrap_or(GRANT_DURATIONS[1].1);
        let Some((resource, action)) = parse_grant_preset(&perm) else {
            error.set(Some("Select a permission preset".into()));
            return;
        };
        if tid.is_empty() || uid.is_empty() {
            error.set(Some("Select tenant and user".into()));
            return;
        }
        let desc = description.read().trim().to_string();
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match grants::create_grant(
                    &token,
                    &uid,
                    &tid,
                    resource,
                    action,
                    secs,
                    if desc.is_empty() { None } else { Some(&desc) },
                )
                .await
                {
                    Ok(grant) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Grant {} issued for user {uid} (expires automatically)",
                            grant.id
                        )));
                        reset_create();
                        reload();
                    }
                    Err(err) => {
                        submitting.set(false);
                        error.set(Some(display_api_error(&err)));
                    }
                },
                Err(err) => {
                    submitting.set(false);
                    error.set(Some(display_api_error(&err)));
                }
            }
        });
    };

    let user_name_for = |uid: &str| -> String {
        users_list
            .read()
            .iter()
            .find(|u| u.id.as_deref() == Some(uid))
            .map(user_label)
            .unwrap_or_else(|| uid.to_string())
    };

    let view_fields = view_row
        .read()
        .as_ref()
        .map(|r| grant_detail_fields(r, &user_name_for(&r.user_id)))
        .unwrap_or_default();

    let tid_label = tenant_id.read().clone();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Temporary grants" }
                p { class: "gs-page-lead",
                    "Elevate a user’s permissions for a limited time within the selected tenant. Grant ids (e.g. tg-…) are generated by the server."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                div { class: "gs-page-toolbar",
                    TenantSelect {
                        tenants: tenants_list.read().clone(),
                        value: tenant_id.read().clone(),
                        on_change: move |e: FormEvent| {
                            tenant_id.set(e.value());
                            reload();
                        },
                    }
                    button {
                        class: "gs-btn gs-btn--primary",
                        r#type: "button",
                        onclick: move |_| {
                            create_tenant.set(tenant_id.read().clone());
                            create_step.set(1);
                            create_open.set(true);
                        },
                        "Issue grant"
                    }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading grants for {tid_label}…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No active grants in this tenant." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Grant id" }
                                    th { "User" }
                                    th { "Permission" }
                                    th { "Expires" }
                                    th { "Actions" }
                                }
                            }
                            tbody {
                                for row in rows.read().iter().cloned() {
                                    {
                                        let id = row.id.clone();
                                        let user_name = user_name_for(&row.user_id);
                                        rsx! {
                                            tr { key: "{id}",
                                                td { code { "{id}" } }
                                                td { "{user_name}" }
                                                td { "{row.resource}.{row.action}" }
                                                td { class: "gs-table-muted",
                                                    "{row.expires_at.map(|t| t.to_string()).unwrap_or_else(|| \"—\".into())}"
                                                }
                                                td { class: "gs-table-actions",
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        onclick: {
                                                            let row = row.clone();
                                                            move |_| view_row.set(Some(row.clone()))
                                                        },
                                                        "View"
                                                    }
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        onclick: {
                                                            let id = id.clone();
                                                            move |_| {
                                                                let id = id.clone();
                                                                spawn(async move {
                                                                    if let Ok(token) = token_from(&auth) {
                                                                        if grants::revoke_grant(&token, &id).await.is_ok() {
                                                                            flash.set(Some(format!("Revoked {id}")));
                                                                            reload();
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        },
                                                        "Revoke"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                AdminDetailModal {
                    open: view_row.read().is_some(),
                    title: String::from("Grant details"),
                    on_close: move |_| view_row.set(None),
                    fields: view_fields,
                }

                AdminStepperModal {
                    open: *create_open.read(),
                    title: String::from("Issue temporary grant"),
                    step: *create_step.read(),
                    total_steps: 4,
                    submitting: *submitting.read(),
                    submit_label: String::from("Issue grant"),
                    on_close: move |_| reset_create(),
                    on_back: move |_| create_step.set(create_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *create_step.read() == 1 {
                            if create_tenant.read().is_empty() || create_user.read().is_empty() {
                                error.set(Some("Select tenant and user".into()));
                                return;
                            }
                        }
                        create_step.set(create_step() + 1);
                    },
                    on_submit: on_create,
                    if *create_step.read() == 1 {
                        div { class: "gs-form-row",
                            TenantSelect {
                                tenants: tenants_list.read().clone(),
                                value: create_tenant.read().clone(),
                                on_change: move |e: FormEvent| create_tenant.set(e.value()),
                                field_id: String::from("gs-grant-create-tenant"),
                            }
                            UserSelect {
                                users: users_list.read().clone(),
                                value: create_user.read().clone(),
                                on_change: move |e: FormEvent| create_user.set(e.value()),
                                placeholder: String::from("Select user…"),
                                field_id: String::from("gs-grant-create-user"),
                            }
                        }
                    } else if *create_step.read() == 2 {
                        GrantPermissionSelect {
                            value: permission_key.read().clone(),
                            on_change: move |e: FormEvent| permission_key.set(e.value()),
                            field_id: String::from("gs-grant-create-permission"),
                        }
                    } else if *create_step.read() == 3 {
                        div { class: "gs-form-row",
                            GrantDurationSelect {
                                value: duration_secs.read().clone(),
                                on_change: move |e: FormEvent| duration_secs.set(e.value()),
                                field_id: String::from("gs-grant-create-duration"),
                            }
                            TextAreaField {
                                label: String::from("Description"),
                                value: description.read().clone(),
                                placeholder: String::from("Why this elevation is needed"),
                                on_input: move |e: FormEvent| description.set(e.value()),
                            }
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Tenant" }
                                dd { class: "gs-detail-value", "{create_tenant}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "User" }
                                dd { class: "gs-detail-value",
                                    "{user_name_for(&create_user.read())}"
                                }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Permission" }
                                dd { class: "gs-detail-value", "{permission_key}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Duration (seconds)" }
                                dd { class: "gs-detail-value", "{duration_secs}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Description" }
                                dd { class: "gs-detail-value",
                                    if description.read().trim().is_empty() {
                                        "—"
                                    } else {
                                        "{description}"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
