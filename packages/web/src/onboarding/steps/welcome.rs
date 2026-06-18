use dioxus::prelude::*;

use crate::{
    auth_api,
    auth_session::AuthContext,
    onboarding::{AuthMode, OnboardingContext},
};

#[component]
pub fn WizardWelcomeStep() -> Element {
    let mut auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();
    let mut mode = use_signal(|| *onboarding.auth_mode.read());
    let mut name = use_signal(String::new);
    let mut email = use_signal(String::new);
    let mut password = use_signal(String::new);
    let mut local_error = use_signal(|| None::<String>);

    rsx! {
        div { class: "gs-wizard-step gs-wizard-step--welcome",
            h2 { class: "gs-wizard-step__title", "Welcome to GeoSyntra" }
            p { class: "gs-wizard-step__lede",
                "Sign in or create an account to start your spatial workspace."
            }
            div { class: "gs-wizard-step__tabs",
                button {
                    class: if mode() == AuthMode::Signin { "gs-wizard-tab gs-wizard-tab--active" } else { "gs-wizard-tab" },
                    onclick: move |_| {
                        mode.set(AuthMode::Signin);
                        onboarding.auth_mode.set(AuthMode::Signin);
                    },
                    "Sign in"
                }
                button {
                    class: if mode() == AuthMode::Signup { "gs-wizard-tab gs-wizard-tab--active" } else { "gs-wizard-tab" },
                    onclick: move |_| {
                        mode.set(AuthMode::Signup);
                        onboarding.auth_mode.set(AuthMode::Signup);
                    },
                    "Register"
                }
            }
            if let Some(err) = local_error.read().clone().or_else(|| auth.error.read().clone()) {
                p { class: "gs-error", "{err}" }
            }
            if mode() == AuthMode::Signup {
                div { class: "gs-field",
                    label { r#for: "wizard-name", "Name" }
                    input {
                        id: "wizard-name",
                        value: "{name}",
                        oninput: move |e| name.set(e.value()),
                        autocomplete: "name",
                    }
                }
            }
            div { class: "gs-field",
                label { r#for: "wizard-email", "Email" }
                input {
                    id: "wizard-email",
                    r#type: "email",
                    value: "{email}",
                    oninput: move |e| email.set(e.value()),
                    autocomplete: "email",
                }
            }
            div { class: "gs-field",
                label { r#for: "wizard-password", "Password" }
                input {
                    id: "wizard-password",
                    r#type: "password",
                    value: "{password}",
                    oninput: move |e| password.set(e.value()),
                    autocomplete: if mode() == AuthMode::Signin { "current-password" } else { "new-password" },
                }
            }
            div { class: "gs-wizard-step__oauth gs-hint",
                p { "OAuth (Google / GitHub) completes on this page — query params are stripped after callback." }
            }
            button {
                class: "gs-btn gs-btn--primary gs-wizard-step__submit",
                disabled: *auth.busy.read(),
                onclick: move |_| {
                    let email_val = email.read().clone();
                    let password_val = password.read().clone();
                    let name_val = name.read().clone();
                    let is_signup = mode() == AuthMode::Signup;
                    spawn(async move {
                        auth.busy.set(true);
                        auth.error.set(None);
                        local_error.set(None);
                        let result = if is_signup {
                            match auth_api::register(&name_val, &email_val, &password_val).await {
                                Ok(()) => auth_api::login(&email_val, &password_val).await,
                                Err(err) => Err(err),
                            }
                        } else {
                            auth_api::login(&email_val, &password_val).await
                        };
                        match result {
                            Ok(session) => {
                                auth.set_session(session.clone());
                                auth.busy.set(false);
                                if let Some(route) = onboarding.handle_post_auth(&session) {
                                    let _ = nav.replace(route);
                                }
                            }
                            Err(err) => {
                                auth.busy.set(false);
                                local_error.set(Some(crate::auth_session::describe_session_error(&err)));
                            }
                        }
                    });
                },
                if *auth.busy.read() { "Working…" } else if mode() == AuthMode::Signin { "Sign in" } else { "Create account" }
            }
            button {
                class: "gs-btn gs-btn--ghost",
                onclick: move |_| onboarding.close_wizard(),
                "Close"
            }
        }
    }
}
