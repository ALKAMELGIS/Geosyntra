use dioxus::prelude::*;

use crate::{
    api::admin::{
        bearer_token,
        memberships::{self, MembershipRow},
        tenants::TenantRow,
        users::AdminUser,
    },
    auth_session::AuthContext,
    components::admin::{
        load_catalog, user_label, AdminDetailModal, AdminShell, AdminStepperModal,
        MultiRoleSelect, TenantSelect, UserSelect,
    },
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn membership_detail_fields(
    row: &MembershipRow,
    user_name: &str,
) -> Vec<(String, String)> {
    vec![
        ("User".into(), user_name.to_string()),
        ("User id".into(), row.user_id.clone()),
        ("Tenant id".into(), row.tenant_id.clone()),
        (
            "Roles".into(),
            row.roles.join(", "),
        ),
        (
            "Role display".into(),
            row.role_display.clone().unwrap_or_else(|| "—".into()),
        ),
    ]
}

#[component]
pub fn AdminMemberships() -> Element {
    let auth = AuthContext::use_auth();
    let default_tenant = auth.session.read().active_tenant().to_string();
    let mut role_slugs = use_signal(Vec::<String>::new);
    let mut tenants_list = use_signal(Vec::<TenantRow>::new);
    let mut users_list = use_signal(Vec::<AdminUser>::new);
    let mut tenant_id = use_signal(move || default_tenant.clone());
    let mut rows = use_signal(Vec::<MembershipRow>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    let mut create_open = use_signal(|| false);
    let mut create_step = use_signal(|| 1_u32);
    let mut create_user = use_signal(String::new);
    let mut create_tenant = use_signal(String::new);
    let mut create_roles = use_signal(|| vec!["viewer".to_string()]);

    let mut edit_open = use_signal(|| false);
    let mut edit_step = use_signal(|| 1_u32);
    let mut edit_user_id = use_signal(String::new);
    let mut edit_tenant_id = use_signal(String::new);
    let mut edit_roles = use_signal(Vec::<String>::new);

    let mut view_row = use_signal(|| None::<MembershipRow>);

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
                Ok(token) => match memberships::list_memberships(&token, &tid).await {
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
                        let slugs: Vec<_> = catalog.roles.into_iter().map(|r| r.role).collect();
                        if !slugs.is_empty() && create_roles.read().is_empty() {
                            create_roles.set(vec![slugs.first().cloned().unwrap_or_else(|| "viewer".into())]);
                        }
                        role_slugs.set(slugs);
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
        create_roles.set(vec!["viewer".to_string()]);
    };

    let on_create = move |_| {
        let tid = create_tenant.read().clone();
        let uid = create_user.read().clone();
        let roles = create_roles.read().clone();
        if tid.is_empty() || uid.is_empty() || roles.is_empty() {
            error.set(Some("Select tenant, user, and at least one role".into()));
            return;
        }
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match memberships::create_membership(&token, &uid, &tid, &roles).await {
                    Ok(_) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Membership created for user {uid} in tenant {tid}"
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

    let mut reset_edit = move || {
        edit_open.set(false);
        edit_step.set(1);
        edit_user_id.set(String::new());
        edit_tenant_id.set(String::new());
        edit_roles.set(Vec::new());
    };

    let on_save_edit = move |_| {
        let uid = edit_user_id.read().clone();
        let tid = edit_tenant_id.read().clone();
        let roles = edit_roles.read().clone();
        if uid.is_empty() || tid.is_empty() || roles.is_empty() {
            error.set(Some("At least one role is required".into()));
            return;
        }
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match memberships::update_role(&token, &uid, &tid, &roles).await {
                    Ok(()) => {
                        submitting.set(false);
                        flash.set(Some("Membership roles updated".into()));
                        reset_edit();
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

    let mut open_edit = move |row: MembershipRow| {
        edit_user_id.set(row.user_id.clone());
        edit_tenant_id.set(row.tenant_id.clone());
        edit_roles.set(row.roles.clone());
        edit_step.set(1);
        edit_open.set(true);
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
        .map(|r| membership_detail_fields(r, &user_name_for(&r.user_id)))
        .unwrap_or_default();

    let tid_label = tenant_id.read().clone();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Memberships" }
                p { class: "gs-page-lead",
                    "Assign an existing user to a tenant with a role. User ids come from the directory — grants and memberships are isolated per tenant."
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
                        "Add membership"
                    }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading memberships for {tid_label}…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No memberships in this tenant." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "User" }
                                    th { "Tenant" }
                                    th { "Roles" }
                                    th { "Actions" }
                                }
                            }
                            tbody {
                                for row in rows.read().iter().cloned() {
                                    {
                                        let uid = row.user_id.clone();
                                        let tid = row.tenant_id.clone();
                                        let user_name = user_name_for(&uid);
                                        let role_label = row.role_display.clone()
                                            .or_else(|| row.roles.first().cloned())
                                            .unwrap_or_else(|| "—".into());
                                        rsx! {
                                            tr { key: "{uid}-{tid}",
                                                td { "{user_name}" }
                                                td { code { "{tid}" } }
                                                td { "{role_label}" }
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
                                                            let row = row.clone();
                                                            move |_| open_edit(row.clone())
                                                        },
                                                        "Edit roles"
                                                    }
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        onclick: {
                                                            let uid = uid.clone();
                                                            let tid = tid.clone();
                                                            move |_| {
                                                                let uid = uid.clone();
                                                                let tid = tid.clone();
                                                                spawn(async move {
                                                                    if let Ok(token) = token_from(&auth) {
                                                                        if memberships::delete_membership(&token, &uid, &tid).await.is_ok() {
                                                                            flash.set(Some("Membership removed".into()));
                                                                            reload();
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        },
                                                        "Remove"
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
                    title: String::from("Membership details"),
                    on_close: move |_| view_row.set(None),
                    fields: view_fields,
                }

                AdminStepperModal {
                    open: *create_open.read(),
                    title: String::from("Add membership"),
                    step: *create_step.read(),
                    total_steps: 4,
                    submitting: *submitting.read(),
                    submit_label: String::from("Add membership"),
                    on_close: move |_| reset_create(),
                    on_back: move |_| create_step.set(create_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *create_step.read() == 1 {
                            if create_user.read().is_empty() {
                                error.set(Some("Select a user".into()));
                                return;
                            }
                        } else if *create_step.read() == 2 {
                            if create_tenant.read().is_empty() {
                                error.set(Some("Select a tenant".into()));
                                return;
                            }
                        } else if *create_step.read() == 3 {
                            if create_roles.read().is_empty() {
                                error.set(Some("Select at least one role".into()));
                                return;
                            }
                        }
                        create_step.set(create_step() + 1);
                    },
                    on_submit: on_create,
                    if *create_step.read() == 1 {
                        UserSelect {
                            users: users_list.read().clone(),
                            value: create_user.read().clone(),
                            on_change: move |e: FormEvent| create_user.set(e.value()),
                            placeholder: String::from("Select user…"),
                            field_id: String::from("gs-membership-create-user"),
                        }
                    } else if *create_step.read() == 2 {
                        TenantSelect {
                            tenants: tenants_list.read().clone(),
                            value: create_tenant.read().clone(),
                            on_change: move |e: FormEvent| create_tenant.set(e.value()),
                            field_id: String::from("gs-membership-create-tenant"),
                        }
                    } else if *create_step.read() == 3 {
                        MultiRoleSelect {
                            role_slugs: role_slugs.read().clone(),
                            selected: create_roles.read().clone(),
                            on_toggle: move |slug: String| {
                                create_roles.with_mut(|list| {
                                    if let Some(pos) = list.iter().position(|s| s == &slug) {
                                        list.remove(pos);
                                    } else {
                                        list.push(slug);
                                    }
                                });
                            },
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "User" }
                                dd { class: "gs-detail-value",
                                    "{user_name_for(&create_user.read())}"
                                }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Tenant" }
                                dd { class: "gs-detail-value", "{create_tenant}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Roles" }
                                dd { class: "gs-detail-value",
                                    "{create_roles.read().join(\", \")}"
                                }
                            }
                        }
                    }
                }

                AdminStepperModal {
                    open: *edit_open.read(),
                    title: String::from("Edit membership roles"),
                    step: *edit_step.read(),
                    total_steps: 2,
                    submitting: *submitting.read(),
                    submit_label: String::from("Save roles"),
                    on_close: move |_| reset_edit(),
                    on_back: move |_| edit_step.set(edit_step().saturating_sub(1)),
                    on_next: move |_| {
                        if edit_roles.read().is_empty() {
                            error.set(Some("Select at least one role".into()));
                            return;
                        }
                        edit_step.set(edit_step() + 1);
                    },
                    on_submit: on_save_edit,
                    if *edit_step.read() == 1 {
                        MultiRoleSelect {
                            role_slugs: role_slugs.read().clone(),
                            selected: edit_roles.read().clone(),
                            on_toggle: move |slug: String| {
                                edit_roles.with_mut(|list| {
                                    if let Some(pos) = list.iter().position(|s| s == &slug) {
                                        list.remove(pos);
                                    } else {
                                        list.push(slug);
                                    }
                                });
                            },
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "User" }
                                dd { class: "gs-detail-value",
                                    "{user_name_for(&edit_user_id.read())}"
                                }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Tenant" }
                                dd { class: "gs-detail-value", "{edit_tenant_id}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Roles" }
                                dd { class: "gs-detail-value",
                                    "{edit_roles.read().join(\", \")}"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
