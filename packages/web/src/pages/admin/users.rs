use dioxus::prelude::*;

use crate::{
    api::admin::{bearer_token, users::{self, AdminUser, UserPatch}},
    auth_session::AuthContext,
    components::admin::{
        load_catalog, AdminDetailModal, AdminShell, AdminStepperModal, RoleSelect,
        forms::{TextAreaField, TextField},
    },
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn user_status_label(user: &AdminUser) -> String {
    if user.is_suspended() {
        "Suspended".into()
    } else if user.is_pending() {
        "Pending".into()
    } else {
        "Active".into()
    }
}

fn user_detail_fields(user: &AdminUser) -> Vec<(String, String)> {
    vec![
        ("Id".into(), user.id.clone().unwrap_or_else(|| "—".into())),
        (
            "Name".into(),
            user.display_name(),
        ),
        (
            "Email".into(),
            user.email.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Role".into(),
            user.role
                .clone()
                .or(user.role_slug.clone())
                .unwrap_or_else(|| "—".into()),
        ),
        ("Status".into(), user_status_label(user)),
        (
            "Username".into(),
            user.username.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Bio".into(),
            user.bio.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Language".into(),
            user.language.clone().unwrap_or_else(|| "—".into()),
        ),
    ]
}

#[component]
pub fn AdminUsers() -> Element {
    let auth = AuthContext::use_auth();
    let session_tenant = auth.session.read().active_tenant().to_string();
    let tenant_display = session_tenant.clone();
    let mut rows = use_signal(Vec::<AdminUser>::new);
    let mut role_slugs = use_signal(Vec::<String>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut busy_id = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    let mut create_open = use_signal(|| false);
    let mut create_step = use_signal(|| 1_u32);
    let mut new_email = use_signal(String::new);
    let mut new_name = use_signal(String::new);
    let mut new_last_name = use_signal(|| "User".to_string());
    let mut new_username = use_signal(String::new);
    let mut new_role = use_signal(|| "viewer".to_string());

    let mut view_user = use_signal(|| None::<AdminUser>);
    let mut edit_open = use_signal(|| false);
    let mut edit_step = use_signal(|| 1_u32);
    let mut edit_id = use_signal(|| None::<String>);
    let mut edit_first_name = use_signal(String::new);
    let mut edit_last_name = use_signal(String::new);
    let mut edit_username = use_signal(String::new);
    let mut edit_name = use_signal(String::new);
    let mut edit_email = use_signal(String::new);
    let mut edit_role = use_signal(String::new);
    let mut edit_bio = use_signal(String::new);
    let mut edit_phone = use_signal(String::new);
    let mut edit_website = use_signal(String::new);
    let mut edit_avatar = use_signal(String::new);
    let mut edit_email_notifications = use_signal(|| true);
    let mut edit_push_notifications = use_signal(|| true);
    let mut edit_two_factor = use_signal(|| false);
    let mut edit_language = use_signal(|| "en".to_string());

    let mut reload = move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match users::list_users(&token).await {
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
                        let slugs: Vec<_> = catalog.roles.into_iter().map(|r| r.role).collect();
                        if !slugs.is_empty() && !slugs.contains(&new_role.read().clone()) {
                            new_role.set(slugs.first().cloned().unwrap_or_else(|| "viewer".into()));
                        }
                        role_slugs.set(slugs);
                    }
                }
                Err(err) => error.set(Some(display_api_error(&err))),
            }
            reload();
        });
    });

    let run_action = move |user_id: String, action: &'static str| {
        spawn(async move {
            busy_id.set(Some(user_id.clone()));
            error.set(None);
            let result = match token_from(&auth) {
                Ok(token) => match action {
                    "approve" => users::approve_user(&token, &user_id).await,
                    "suspend" => users::suspend_user(&token, &user_id).await,
                    "reactivate" => users::reactivate_user(&token, &user_id).await,
                    "delete" => users::delete_user(&token, &user_id).await,
                    _ => Ok(()),
                },
                Err(err) => Err(err),
            };
            busy_id.set(None);
            match result {
                Ok(()) => {
                    flash.set(Some(format!("User {action} succeeded")));
                    reload();
                }
                Err(err) => error.set(Some(display_api_error(&err))),
            }
        });
    };

    let mut reset_create = move || {
        create_open.set(false);
        create_step.set(1);
        new_email.set(String::new());
        new_name.set(String::new());
        new_last_name.set("User".into());
        new_username.set(String::new());
    };

    let on_create = move |_| {
        let email = new_email.read().trim().to_string();
        let name = new_name.read().trim().to_string();
        let last_name = new_last_name.read().trim().to_string();
        let username = new_username.read().trim().to_string();
        let role = new_role.read().trim().to_string();
        if email.is_empty() || name.is_empty() {
            error.set(Some("Email and first name are required".into()));
            return;
        }
        let last = if last_name.is_empty() {
            "User".to_string()
        } else {
            last_name
        };
        let username_opt = if username.is_empty() {
            None
        } else {
            Some(username)
        };
        let tenant_label = session_tenant.clone();
        spawn(async move {
            submitting.set(true);
            match token_from(&auth) {
                Ok(token) => {
                    let uname_ref = username_opt.as_deref();
                    match users::create_user(&token, &email, &name, &last, uname_ref, &role).await {
                        Ok(created) => {
                            submitting.set(false);
                            let id = created.id.unwrap_or_else(|| "?".into());
                            flash.set(Some(format!(
                                "User created — server assigned id {id} in tenant {tenant_label}"
                            )));
                            reset_create();
                            reload();
                        }
                        Err(err) => {
                            submitting.set(false);
                            error.set(Some(display_api_error(&err)));
                        }
                    }
                }
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
        edit_id.set(None);
    };

    let on_save_edit = move |_| {
        let Some(id) = edit_id.read().clone() else {
            return;
        };
        let first = edit_first_name.read().trim().to_string();
        let last = edit_last_name.read().trim().to_string();
        let username = edit_username.read().trim().to_string();
        let name = edit_name.read().trim().to_string();
        let email = edit_email.read().trim().to_string();
        let role = edit_role.read().trim().to_string();
        let bio = edit_bio.read().trim().to_string();
        let phone = edit_phone.read().trim().to_string();
        let website = edit_website.read().trim().to_string();
        let avatar = edit_avatar.read().trim().to_string();
        let language = edit_language.read().trim().to_string();
        let patch = UserPatch {
            name: if name.is_empty() { None } else { Some(name) },
            first_name: if first.is_empty() { None } else { Some(first) },
            last_name: if last.is_empty() { None } else { Some(last) },
            username: if username.is_empty() { None } else { Some(username) },
            email: if email.is_empty() { None } else { Some(email) },
            role_slug: if role.is_empty() { None } else { Some(role) },
            bio: if bio.is_empty() { None } else { Some(bio) },
            phone_number: if phone.is_empty() { None } else { Some(phone) },
            website: if website.is_empty() { None } else { Some(website) },
            avatar_url: if avatar.is_empty() { None } else { Some(avatar) },
            email_notifications: Some(*edit_email_notifications.read()),
            push_notifications: Some(*edit_push_notifications.read()),
            two_factor_auth: Some(*edit_two_factor.read()),
            language: if language.is_empty() { None } else { Some(language) },
        };
        spawn(async move {
            submitting.set(true);
            match token_from(&auth) {
                Ok(token) => {
                    let result = users::update_user(&token, &id, &patch).await;
                    submitting.set(false);
                    match result {
                        Ok(()) => {
                            flash.set(Some(format!("User {id} updated")));
                            reset_edit();
                            reload();
                        }
                        Err(err) => error.set(Some(display_api_error(&err))),
                    }
                }
                Err(err) => {
                    submitting.set(false);
                    error.set(Some(display_api_error(&err)));
                }
            }
        });
    };

    let mut open_edit = move |user: AdminUser| {
        let user_id = user.id.clone().unwrap_or_default();
        edit_id.set(Some(user_id));
        edit_first_name.set(
            user.first_name
                .clone()
                .or(user.name.clone())
                .unwrap_or_default(),
        );
        edit_last_name.set(user.last_name.clone().unwrap_or_else(|| "User".into()));
        edit_username.set(user.username.clone().unwrap_or_default());
        edit_name.set(user.display_name());
        edit_email.set(user.email.clone().unwrap_or_default());
        edit_role.set(
            user.role_slug
                .clone()
                .or(user.role.clone())
                .unwrap_or_else(|| "viewer".into()),
        );
        edit_bio.set(user.bio.clone().unwrap_or_default());
        edit_phone.set(user.phone_number.clone().unwrap_or_default());
        edit_website.set(user.website.clone().unwrap_or_default());
        edit_avatar.set(user.avatar_url.clone().unwrap_or_default());
        edit_email_notifications.set(user.email_notifications.unwrap_or(true));
        edit_push_notifications.set(user.push_notifications.unwrap_or(true));
        edit_two_factor.set(user.two_factor_auth.unwrap_or(false));
        edit_language.set(user.language.clone().unwrap_or_else(|| "en".into()));
        edit_step.set(1);
        edit_open.set(true);
    };

    let view_fields = view_user
        .read()
        .as_ref()
        .map(user_detail_fields)
        .unwrap_or_default();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Users" }
                p { class: "gs-page-lead",
                    "Create users in tenant "
                    code { "{tenant_display}" }
                    ". Numeric ids are assigned by the server — do not enter them manually."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                div { class: "gs-page-toolbar",
                    span { class: "gs-hint", "Tenant directory" }
                    button {
                        class: "gs-btn gs-btn--primary",
                        r#type: "button",
                        onclick: move |_| {
                            create_step.set(1);
                            create_open.set(true);
                        },
                        "Create user"
                    }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading users…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No users in this tenant directory." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Id" }
                                    th { "Name" }
                                    th { "Email" }
                                    th { "Role" }
                                    th { "Status" }
                                    th { "Actions" }
                                }
                            }
                            tbody {
                                for user in rows.read().iter().cloned() {
                                    {
                                        let user_id = user.id.clone().unwrap_or_default();
                                        let busy = busy_id.read().as_deref() == Some(user_id.as_str());
                                        rsx! {
                                            tr { key: "{user_id}",
                                                td { code { "{user_id}" } }
                                                td { "{user.display_name()}" }
                                                td { class: "gs-table-muted",
                                                    "{user.email.clone().unwrap_or_else(|| \"—\".into())}"
                                                }
                                                td {
                                                    "{user.role.clone().unwrap_or_else(|| user.role_slug.clone().unwrap_or_else(|| \"—\".into()))}"
                                                }
                                                td {
                                                    if user.is_suspended() {
                                                        span { class: "gs-badge gs-badge--suspended", "Suspended" }
                                                    } else if user.is_pending() {
                                                        span { class: "gs-badge gs-badge--pending", "Pending" }
                                                    } else {
                                                        span { class: "gs-badge gs-badge--active", "Active" }
                                                    }
                                                }
                                                td { class: "gs-table-actions",
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        disabled: busy,
                                                        onclick: {
                                                            let user = user.clone();
                                                            move |_| view_user.set(Some(user.clone()))
                                                        },
                                                        "View"
                                                    }
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        disabled: busy,
                                                        onclick: {
                                                            let user = user.clone();
                                                            move |_| open_edit(user.clone())
                                                        },
                                                        "Edit"
                                                    }
                                                    if user.is_pending() {
                                                        button {
                                                            class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                            disabled: busy,
                                                            onclick: {
                                                                let user_id = user_id.clone();
                                                                move |_| run_action(user_id.clone(), "approve")
                                                            },
                                                            "Approve"
                                                        }
                                                    }
                                                    if !user.is_suspended() && !user.is_pending() {
                                                        button {
                                                            class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                            disabled: busy,
                                                            onclick: {
                                                                let user_id = user_id.clone();
                                                                move |_| run_action(user_id.clone(), "suspend")
                                                            },
                                                            "Suspend"
                                                        }
                                                    }
                                                    if user.is_suspended() {
                                                        button {
                                                            class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                            disabled: busy,
                                                            onclick: {
                                                                let user_id = user_id.clone();
                                                                move |_| run_action(user_id.clone(), "reactivate")
                                                            },
                                                            "Reactivate"
                                                        }
                                                    }
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        disabled: busy,
                                                        onclick: {
                                                            let user_id = user_id.clone();
                                                            move |_| run_action(user_id.clone(), "delete")
                                                        },
                                                        "Delete"
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
                    open: view_user.read().is_some(),
                    title: String::from("User details"),
                    on_close: move |_| view_user.set(None),
                    fields: view_fields,
                }

                AdminStepperModal {
                    open: *create_open.read(),
                    title: String::from("Create user"),
                    step: *create_step.read(),
                    total_steps: 3,
                    submitting: *submitting.read(),
                    submit_label: String::from("Create user"),
                    on_close: move |_| reset_create(),
                    on_back: move |_| create_step.set(create_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *create_step.read() == 1 {
                            let email = new_email.read().trim().to_string();
                            let name = new_name.read().trim().to_string();
                            if email.is_empty() || name.is_empty() {
                                error.set(Some("Email and first name are required".into()));
                                return;
                            }
                        }
                        create_step.set(create_step() + 1);
                    },
                    on_submit: on_create,
                    if *create_step.read() == 1 {
                        div { class: "gs-form-row",
                            div { class: "gs-field gs-field--grow",
                                label { "Email" }
                                input {
                                    r#type: "email",
                                    class: "gs-input",
                                    value: "{new_email}",
                                    placeholder: "user@example.com",
                                    oninput: move |e| new_email.set(e.value()),
                                }
                            }
                            TextField {
                                label: String::from("First name"),
                                value: new_name.read().clone(),
                                placeholder: String::from("Jane-Analyst"),
                                hint: String::from("Letters, numbers, hyphens only (spaces become hyphens)."),
                                on_input: move |e: FormEvent| new_name.set(e.value()),
                            }
                            TextField {
                                label: String::from("Last name"),
                                value: new_last_name.read().clone(),
                                placeholder: String::from("User"),
                                on_input: move |e: FormEvent| new_last_name.set(e.value()),
                            }
                            TextField {
                                label: String::from("Username (optional)"),
                                value: new_username.read().clone(),
                                placeholder: String::from("auto from email"),
                                on_input: move |e: FormEvent| new_username.set(e.value()),
                            }
                        }
                    } else if *create_step.read() == 2 {
                        RoleSelect {
                            role_slugs: role_slugs.read().clone(),
                            value: new_role.read().clone(),
                            on_change: move |e: FormEvent| new_role.set(e.value()),
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Email" }
                                dd { class: "gs-detail-value", "{new_email}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "First name" }
                                dd { class: "gs-detail-value", "{new_name}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Last name" }
                                dd { class: "gs-detail-value", "{new_last_name}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Username" }
                                dd { class: "gs-detail-value",
                                    if new_username.read().is_empty() {
                                        "auto from email"
                                    } else {
                                        "{new_username}"
                                    }
                                }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Role" }
                                dd { class: "gs-detail-value", "{new_role}" }
                            }
                        }
                    }
                }

                AdminStepperModal {
                    open: *edit_open.read(),
                    title: String::from("Edit user"),
                    step: *edit_step.read(),
                    total_steps: 3,
                    submitting: *submitting.read(),
                    submit_label: String::from("Save changes"),
                    on_close: move |_| reset_edit(),
                    on_back: move |_| edit_step.set(edit_step().saturating_sub(1)),
                    on_next: move |_| edit_step.set(edit_step() + 1),
                    on_submit: on_save_edit,
                    if *edit_step.read() == 1 {
                        div { class: "gs-form-row",
                            TextField {
                                label: String::from("First name"),
                                value: edit_first_name.read().clone(),
                                on_input: move |e: FormEvent| edit_first_name.set(e.value()),
                            }
                            TextField {
                                label: String::from("Last name"),
                                value: edit_last_name.read().clone(),
                                on_input: move |e: FormEvent| edit_last_name.set(e.value()),
                            }
                            TextField {
                                label: String::from("Username"),
                                value: edit_username.read().clone(),
                                on_input: move |e: FormEvent| edit_username.set(e.value()),
                            }
                            TextField {
                                label: String::from("Display name"),
                                value: edit_name.read().clone(),
                                on_input: move |e: FormEvent| edit_name.set(e.value()),
                            }
                            div { class: "gs-field gs-field--grow",
                                label { "Email" }
                                input {
                                    r#type: "email",
                                    class: "gs-input",
                                    value: "{edit_email}",
                                    oninput: move |e| edit_email.set(e.value()),
                                }
                            }
                            RoleSelect {
                                role_slugs: role_slugs.read().clone(),
                                value: edit_role.read().clone(),
                                on_change: move |e: FormEvent| edit_role.set(e.value()),
                            }
                        }
                    } else if *edit_step.read() == 2 {
                        div { class: "gs-form-row",
                            TextAreaField {
                                label: String::from("Bio"),
                                value: edit_bio.read().clone(),
                                on_input: move |e: FormEvent| edit_bio.set(e.value()),
                            }
                            TextField {
                                label: String::from("Phone"),
                                value: edit_phone.read().clone(),
                                on_input: move |e: FormEvent| edit_phone.set(e.value()),
                            }
                            TextField {
                                label: String::from("Website"),
                                value: edit_website.read().clone(),
                                on_input: move |e: FormEvent| edit_website.set(e.value()),
                            }
                            TextField {
                                label: String::from("Avatar URL"),
                                value: edit_avatar.read().clone(),
                                on_input: move |e: FormEvent| edit_avatar.set(e.value()),
                            }
                        }
                        div { class: "gs-form-row",
                            div { class: "gs-field",
                                label { "Language" }
                                select {
                                    class: "gs-input",
                                    value: "{edit_language}",
                                    onchange: move |e| edit_language.set(e.value()),
                                    option { value: "en", "English" }
                                    option { value: "es", "Spanish" }
                                    option { value: "fr", "French" }
                                    option { value: "de", "German" }
                                }
                            }
                            label { class: "gs-checkbox",
                                input {
                                    r#type: "checkbox",
                                    checked: *edit_email_notifications.read(),
                                    onchange: move |e| edit_email_notifications.set(e.checked()),
                                }
                                " Email notifications"
                            }
                            label { class: "gs-checkbox",
                                input {
                                    r#type: "checkbox",
                                    checked: *edit_push_notifications.read(),
                                    onchange: move |e| edit_push_notifications.set(e.checked()),
                                }
                                " Push notifications"
                            }
                            label { class: "gs-checkbox",
                                input {
                                    r#type: "checkbox",
                                    checked: *edit_two_factor.read(),
                                    onchange: move |e| edit_two_factor.set(e.checked()),
                                }
                                " Two-factor auth"
                            }
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "User id" }
                                dd { class: "gs-detail-value", "{edit_id.read().clone().unwrap_or_default()}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Email" }
                                dd { class: "gs-detail-value", "{edit_email}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Name" }
                                dd { class: "gs-detail-value", "{edit_first_name} {edit_last_name}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Role" }
                                dd { class: "gs-detail-value", "{edit_role}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Language" }
                                dd { class: "gs-detail-value", "{edit_language}" }
                            }
                        }
                    }
                }
            }
        }
    }
}
