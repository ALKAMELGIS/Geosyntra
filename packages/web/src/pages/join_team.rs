use dioxus::prelude::*;

use crate::{
    api::invite,
    auth_session::AuthContext,
    error_display::display_api_error,
    routes::Route,
};

#[component]
pub fn JoinTeam(token: String) -> Element {
    let mut auth = AuthContext::use_auth();
    let nav = use_navigator();
    let invite_token = token.clone();
    let mut email = use_signal(String::new);
    let mut role = use_signal(String::new);
    let mut name = use_signal(String::new);
    let mut password = use_signal(String::new);
    let mut loading = use_signal(|| !token.is_empty());
    let mut error = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    use_effect(move || {
        if invite_token.is_empty() {
            error.set(Some("Missing invitation token.".into()));
            loading.set(false);
            return;
        }
        let token_val = invite_token.clone();
        spawn(async move {
            loading.set(true);
            match invite::preview_invite(&token_val).await {
                Ok(preview) => {
                    email.set(preview.email.unwrap_or_default());
                    role.set(
                        preview
                            .role
                            .or(preview.role_slug)
                            .unwrap_or_default(),
                    );
                    loading.set(false);
                }
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                }
            }
        });
    });

    let on_submit = move |_| {
        if token.is_empty() {
            return;
        }
        let token_val = token.clone();
        let name_val = name.read().clone();
        let password_val = password.read().clone();
        let fallback_email = email.read().clone();
        spawn(async move {
            submitting.set(true);
            error.set(None);
            let display_name = if name_val.trim().is_empty() {
                fallback_email
            } else {
                name_val
            };
            match invite::accept_invite(&token_val, &display_name, &password_val).await {
                Ok(session) => {
                    auth.set_session(session.clone());
                    submitting.set(false);
                    if session.can_access_admin() {
                        nav.replace(Route::AdminOverview {});
                    } else {
                        nav.replace(Route::SatelliteIndices {});
                    }
                }
                Err(err) => {
                    submitting.set(false);
                    error.set(Some(display_api_error(&err)));
                }
            }
        });
    };

    rsx! {
        div { class: "gs-app gs-auth",
            div { class: "gs-auth-card",
                h1 { class: "gs-page-title", "Join your team" }
                if *loading.read() {
                    p { class: "gs-hint", "Loading invitation…" }
                } else {
                    if !role.read().is_empty() {
                        p { class: "gs-page-lead",
                            "Invited as {role.read()}"
                            if !email.read().is_empty() {
                                " for {email.read()}"
                            }
                        }
                    }
                    if let Some(err) = error.read().clone() {
                        p { class: "gs-error", "{err}" }
                    }
                    div { class: "gs-field",
                        label { r#for: "name", "Full name" }
                        input {
                            id: "name",
                            value: "{name}",
                            oninput: move |e| name.set(e.value()),
                        }
                    }
                    div { class: "gs-field",
                        label { r#for: "password", "Password" }
                        input {
                            id: "password",
                            r#type: "password",
                            value: "{password}",
                            oninput: move |e| password.set(e.value()),
                            autocomplete: "new-password",
                        }
                    }
                    button {
                        class: "gs-btn gs-btn--primary",
                        disabled: *submitting.read() || error.read().is_some() && email.read().is_empty(),
                        onclick: on_submit,
                        if *submitting.read() { "Creating account…" } else { "Accept invitation" }
                    }
                }
                p { class: "gs-hint",
                    Link { to: Route::Login {}, "Already have an account? Sign in" }
                }
            }
        }
    }
}
