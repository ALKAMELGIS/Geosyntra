use dioxus::prelude::*;

use crate::{
    api::admin::{
        bearer_token,
        team::{self, INVITE_ROLE_OPTIONS},
        users::{self, AdminUser},
    },
    auth_session::AuthContext,
    components::admin::{AdminDetailModal, AdminShell, AdminStepperModal, forms::TextField},
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn invite_detail_fields(invite: &team::TeamInvite) -> Vec<(String, String)> {
    vec![
        (
            "Email".into(),
            invite.email.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Role".into(),
            invite
                .role
                .clone()
                .or(invite.role_slug.clone())
                .unwrap_or_else(|| "—".into()),
        ),
        (
            "Status".into(),
            invite.status.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Expires".into(),
            invite.expires_at.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Accepted".into(),
            invite.accepted_at.clone().unwrap_or_else(|| "—".into()),
        ),
        (
            "Created".into(),
            invite.created_at.clone().unwrap_or_else(|| "—".into()),
        ),
    ]
}

#[component]
pub fn AdminTeam() -> Element {
    let auth = AuthContext::use_auth();
    let mut invites = use_signal(Vec::<team::TeamInvite>::new);
    let mut pending_users = use_signal(Vec::<AdminUser>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut invite_token = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);
    let mut busy_id = use_signal(|| None::<String>);

    let mut invite_open = use_signal(|| false);
    let mut invite_step = use_signal(|| 1_u32);
    let mut email = use_signal(String::new);
    let mut role_slug = use_signal(|| "manager".to_string());

    let mut view_invite = use_signal(|| None::<team::TeamInvite>);

    let reload = move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => {
                    let invite_result = team::list_invites(&token).await;
                    let users_result = users::list_users(&token).await;
                    match (invite_result, users_result) {
                        (Ok(list), Ok(user_rows)) => {
                            invites.set(list);
                            pending_users.set(
                                user_rows
                                    .into_iter()
                                    .filter(|u| u.is_pending())
                                    .collect(),
                            );
                            loading.set(false);
                        }
                        (Err(err), _) | (_, Err(err)) => {
                            error.set(Some(display_api_error(&err)));
                            loading.set(false);
                        }
                    }
                }
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                }
            }
        });
    };

    use_effect(move || {
        reload();
    });

    let mut reset_invite = move || {
        invite_open.set(false);
        invite_step.set(1);
        email.set(String::new());
        role_slug.set("manager".into());
    };

    let submit_invite = move |_| {
        let email_value = email.read().trim().to_string();
        if email_value.is_empty() {
            error.set(Some("Email is required.".into()));
            return;
        }
        let role = role_slug.read().clone();
        spawn(async move {
            submitting.set(true);
            error.set(None);
            invite_token.set(None);
            match token_from(&auth) {
                Ok(token) => match team::create_invite(&token, &email_value, &role).await {
                    Ok(token) => {
                        flash.set(Some("Invitation created.".into()));
                        invite_token.set(token);
                        reset_invite();
                        reload();
                    }
                    Err(err) => error.set(Some(display_api_error(&err))),
                },
                Err(err) => error.set(Some(display_api_error(&err))),
            }
            submitting.set(false);
        });
    };

    let approve_user = move |user_id: String| {
        spawn(async move {
            busy_id.set(Some(user_id.clone()));
            error.set(None);
            let result = match token_from(&auth) {
                Ok(token) => users::approve_user(&token, &user_id).await,
                Err(err) => Err(err),
            };
            busy_id.set(None);
            match result {
                Ok(()) => {
                    flash.set(Some("User approved.".into()));
                    reload();
                }
                Err(err) => error.set(Some(display_api_error(&err))),
            }
        });
    };

    let view_fields = view_invite
        .read()
        .as_ref()
        .map(invite_detail_fields)
        .unwrap_or_default();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Team & invitations" }
                p { class: "gs-page-lead",
                    "Invite staff accounts and approve pending signups."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }
                if let Some(token) = invite_token.read().clone() {
                    p { class: "gs-hint",
                        "Dev invite token: "
                        code { "{token}" }
                    }
                }

                div { class: "gs-page-toolbar",
                    span { class: "gs-hint",
                        "Public signup creates trial users. Staff accounts are invite-only."
                    }
                    button {
                        class: "gs-btn gs-btn--primary",
                        r#type: "button",
                        onclick: move |_| {
                            invite_step.set(1);
                            invite_open.set(true);
                        },
                        "Invite team member"
                    }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading team data…" }
                } else {
                    div { class: "gs-card",
                        h2 { class: "gs-card-title",
                            "Pending approval ({pending_users.read().len()})"
                        }
                        if pending_users.read().is_empty() {
                            p { class: "gs-hint", "No accounts awaiting approval." }
                        } else {
                            ul { class: "gs-list",
                                for user in pending_users.read().iter().cloned() {
                                    {
                                        let user_id = user.id.clone().unwrap_or_default();
                                        let busy = busy_id.read().as_deref() == Some(user_id.as_str());
                                        rsx! {
                                            li { class: "gs-list__item", key: "{user_id}",
                                                span {
                                                    "{user.display_name()} — "
                                                    "{user.email.clone().unwrap_or_else(|| \"—\".into())}"
                                                }
                                                button {
                                                    class: "gs-btn gs-btn--primary gs-btn--inline",
                                                    disabled: busy,
                                                    onclick: {
                                                        let user_id = user_id.clone();
                                                        move |_| approve_user(user_id.clone())
                                                    },
                                                    "Approve"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    div { class: "gs-card",
                        h2 { class: "gs-card-title", "Invitations" }
                        if invites.read().is_empty() {
                            p { class: "gs-hint", "No invitations on record." }
                        } else {
                            div { class: "gs-table-wrap",
                                table { class: "gs-table",
                                    thead {
                                        tr {
                                            th { "Email" }
                                            th { "Role" }
                                            th { "Status" }
                                            th { "Expires" }
                                            th { "Actions" }
                                        }
                                    }
                                    tbody {
                                        for (idx, invite) in invites.read().iter().enumerate() {
                                            {
                                                let invite_clone = invite.clone();
                                                rsx! {
                                                    tr { key: "{idx}",
                                                        td {
                                                            "{invite.email.clone().unwrap_or_else(|| \"—\".into())}"
                                                        }
                                                        td {
                                                            "{invite.role.clone().unwrap_or_else(|| invite.role_slug.clone().unwrap_or_else(|| \"—\".into()))}"
                                                        }
                                                        td {
                                                            if invite.is_pending() {
                                                                span { class: "gs-badge gs-badge--pending", "Pending" }
                                                            } else {
                                                                span { class: "gs-badge gs-badge--active",
                                                                    "{invite.status.clone().unwrap_or_else(|| \"—\".into())}"
                                                                }
                                                            }
                                                        }
                                                        td { class: "gs-table-muted",
                                                            "{invite.expires_at.clone().unwrap_or_else(|| \"—\".into())}"
                                                        }
                                                        td { class: "gs-table-actions",
                                                            button {
                                                                class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                                onclick: move |_| {
                                                                    view_invite.set(Some(invite_clone.clone()))
                                                                },
                                                                "View"
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
                    }
                }

                AdminDetailModal {
                    open: view_invite.read().is_some(),
                    title: String::from("Invitation details"),
                    on_close: move |_| view_invite.set(None),
                    fields: view_fields,
                }

                AdminStepperModal {
                    open: *invite_open.read(),
                    title: String::from("Invite team member"),
                    step: *invite_step.read(),
                    total_steps: 3,
                    submitting: *submitting.read(),
                    submit_label: String::from("Send invite"),
                    on_close: move |_| reset_invite(),
                    on_back: move |_| invite_step.set(invite_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *invite_step.read() == 1 {
                            if email.read().trim().is_empty() {
                                error.set(Some("Email is required.".into()));
                                return;
                            }
                        }
                        invite_step.set(invite_step() + 1);
                    },
                    on_submit: submit_invite,
                    if *invite_step.read() == 1 {
                        TextField {
                            label: String::from("Email"),
                            value: email.read().clone(),
                            placeholder: String::from("colleague@company.com"),
                            on_input: move |e: FormEvent| email.set(e.value()),
                        }
                    } else if *invite_step.read() == 2 {
                        div { class: "gs-field",
                            label { "Role" }
                            select {
                                class: "gs-input",
                                value: "{role_slug}",
                                onchange: move |ev| role_slug.set(ev.value()),
                                for (slug, label) in INVITE_ROLE_OPTIONS.iter() {
                                    option { value: "{slug}", "{label}" }
                                }
                            }
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Email" }
                                dd { class: "gs-detail-value", "{email}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Role" }
                                dd { class: "gs-detail-value", "{role_slug}" }
                            }
                        }
                    }
                }
            }
        }
    }
}
