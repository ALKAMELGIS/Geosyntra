use dioxus::prelude::*;

use crate::{
    auth_api,
    auth_session::AuthContext,
    onboarding::{
        steps::oauth_panel::OAuthGlassPanel, AuthMode, OnboardingContext,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WelcomePhase {
    Form,
    CheckEmail,
    ForgotUsername,
    ForgotPassword,
}

#[component]
pub fn WizardWelcomeStep() -> Element {
    let mut auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();
    let mut mode = use_signal(|| *onboarding.auth_mode.read());
    let mut phase = use_signal(|| WelcomePhase::Form);
    let mut name = use_signal(String::new);
    let mut email = use_signal(String::new);
    let mut password = use_signal(String::new);
    let mut show_password = use_signal(|| false);
    let mut remember = use_signal(|| false);
    let mut local_error = use_signal(|| None::<String>);
    let mut info = use_signal(|| None::<String>);
    let mut pending_email = use_signal(String::new);
    let mut dev_link = use_signal(|| None::<String>);
    let mut reset_dev_link = use_signal(|| None::<String>);

    let back_to_signin = move |_| {
        phase.set(WelcomePhase::Form);
        mode.set(AuthMode::Signin);
        onboarding.auth_mode.set(AuthMode::Signin);
        local_error.set(None);
        info.set(None);
        reset_dev_link.set(None);
    };

    rsx! {
        div { class: "gs-wizard-step gs-wizard-step--welcome",
            div { class: "gs-wizard-welcome__hero",
                p { class: "gs-wizard-step__eyebrow", "Step 1 · Welcome" }
                h2 { class: "gs-wizard-step__title", "Spatial intelligence, without limits" }
                p { class: "gs-wizard-step__lede",
                    "Create your GeoSyntra workspace in minutes. Sign in once — plans and secure checkout stay in this overlay on Home."
                }
                div { class: "gs-wizard-welcome__globe", aria_hidden: "true",
                    i { class: "fa-solid fa-globe" }
                }
            }

            div { class: "gs-wizard-welcome__auth",
                match phase() {
                    WelcomePhase::ForgotUsername => rsx! {
                        div { class: "gs-wizard-recovery",
                            h3 { class: "gs-wizard-recovery__title", "Forgot username?" }
                            p { class: "gs-wizard-recovery__lede",
                                "GeoSyntra sign-in uses your account email. Enter it below and we will show how to sign in."
                            }
                            label { class: "gs-wizard-glass-field",
                                span { class: "gs-wizard-glass-field__label", "Email" }
                                span { class: "gs-wizard-glass-field__shell",
                                    input {
                                        class: "gs-wizard-glass-field__input",
                                        r#type: "email",
                                        value: "{email}",
                                        oninput: move |e| email.set(e.value()),
                                        placeholder: "you@company.com",
                                    }
                                }
                            }
                            if let Some(msg) = info.read().clone() {
                                p { class: "gs-wizard-form__info", "{msg}" }
                            }
                            if let Some(err) = local_error.read().clone() {
                                p { class: "gs-error", "{err}" }
                            }
                            button {
                                class: "gs-btn gs-btn--primary gs-wizard-step__submit",
                                disabled: (auth.busy)(),
                                onclick: move |_| {
                                    let em = email.read().trim().to_lowercase();
                                    if em.is_empty() {
                                        local_error.set(Some("Enter your email address.".into()));
                                        return;
                                    }
                                    spawn(async move {
                                        auth.busy.set(true);
                                        local_error.set(None);
                                        info.set(None);
                                        match auth_api::forgot_username(&em).await {
                                            Ok((found, sign_in_id, message)) => {
                                                if found {
                                                    if let Some(id) = sign_in_id {
                                                        email.set(id);
                                                    }
                                                }
                                                info.set(Some(message));
                                            }
                                            Err(err) => local_error.set(Some(err.user_message())),
                                        }
                                        auth.busy.set(false);
                                    });
                                },
                                if (auth.busy)() { "Looking up…" } else { "Look up sign-in email" }
                            }
                            button {
                                class: "gs-wizard-back",
                                r#type: "button",
                                onclick: back_to_signin,
                                "Back to sign in"
                            }
                        }
                    },
                    WelcomePhase::ForgotPassword => rsx! {
                        div { class: "gs-wizard-recovery",
                            h3 { class: "gs-wizard-recovery__title", "Reset your password" }
                            p { class: "gs-wizard-recovery__lede",
                                "We will email you a secure link to choose a new password (valid for 1 hour)."
                            }
                            label { class: "gs-wizard-glass-field",
                                span { class: "gs-wizard-glass-field__label", "Email" }
                                span { class: "gs-wizard-glass-field__shell",
                                    input {
                                        class: "gs-wizard-glass-field__input",
                                        r#type: "email",
                                        value: "{email}",
                                        oninput: move |e| email.set(e.value()),
                                        placeholder: "you@company.com",
                                    }
                                }
                            }
                            if let Some(msg) = info.read().clone() {
                                p { class: "gs-wizard-form__info", "{msg}" }
                            }
                            if let Some(err) = local_error.read().clone() {
                                p { class: "gs-error", "{err}" }
                            }
                            if let Some(link) = reset_dev_link.read().clone() {
                                p { class: "gs-wizard-check-email__dev",
                                    span { "Dev reset link" }
                                    a { href: "{link}", target: "_blank", rel: "noreferrer", "{link}" }
                                }
                            }
                            button {
                                class: "gs-btn gs-btn--primary gs-wizard-step__submit",
                                disabled: (auth.busy)(),
                                onclick: move |_| {
                                    let em = email.read().trim().to_lowercase();
                                    if em.is_empty() {
                                        local_error.set(Some("Enter your email address.".into()));
                                        return;
                                    }
                                    spawn(async move {
                                        auth.busy.set(true);
                                        local_error.set(None);
                                        info.set(None);
                                        reset_dev_link.set(None);
                                        match auth_api::forgot_password(&em).await {
                                            Ok((message, dev)) => {
                                                info.set(Some(message));
                                                reset_dev_link.set(dev);
                                            }
                                            Err(err) => local_error.set(Some(err.user_message())),
                                        }
                                        auth.busy.set(false);
                                    });
                                },
                                if (auth.busy)() { "Sending…" } else { "Send reset link" }
                            }
                            button {
                                class: "gs-wizard-back",
                                r#type: "button",
                                onclick: back_to_signin,
                                "Back to sign in"
                            }
                        }
                    },
                    WelcomePhase::CheckEmail => rsx! {
                        div { class: "gs-wizard-check-email",
                            h3 { class: "gs-wizard-check-email__title", "Check your email" }
                            p { class: "gs-wizard-check-email__text",
                                "We sent a verification email to "
                                strong { "{pending_email()}" }
                                ". Confirm your email before your account is activated, then return here to sign in."
                            }
                            if let Some(link) = dev_link.read().clone() {
                                p { class: "gs-wizard-check-email__dev",
                                    span { "Dev verification link" }
                                    a { href: "{link}", target: "_blank", rel: "noreferrer", "{link}" }
                                }
                            }
                            if let Some(msg) = info.read().clone() {
                                p { class: "gs-wizard-form__info", "{msg}" }
                            }
                            if let Some(err) = local_error.read().clone() {
                                p { class: "gs-error", "{err}" }
                            }
                            button {
                                class: "gs-btn gs-btn--primary gs-wizard-step__submit",
                                disabled: (auth.busy)(),
                                onclick: move |_| {
                                    let em = pending_email.read().clone();
                                    spawn(async move {
                                        auth.busy.set(true);
                                        local_error.set(None);
                                        match auth_api::resend_verification(&em).await {
                                            Ok((message, link)) => {
                                                info.set(Some(message));
                                                if link.is_some() {
                                                    dev_link.set(link);
                                                }
                                            }
                                            Err(err) => local_error.set(Some(err.user_message())),
                                        }
                                        auth.busy.set(false);
                                    });
                                },
                                if (auth.busy)() { "Sending…" } else { "Resend verification email" }
                            }
                            button {
                                class: "gs-wizard-back",
                                r#type: "button",
                                onclick: back_to_signin,
                                "Back to sign in"
                            }
                        }
                    },
                    WelcomePhase::Form => rsx! {
                        div {
                            div { class: "gs-wizard-step__tabs", role: "tablist",
                                button {
                                    class: if mode() == AuthMode::Signup {
                                        "gs-wizard-tab gs-wizard-tab--active"
                                    } else {
                                        "gs-wizard-tab"
                                    },
                                    role: "tab",
                                    onclick: move |_| {
                                        mode.set(AuthMode::Signup);
                                        onboarding.auth_mode.set(AuthMode::Signup);
                                        local_error.set(None);
                                        auth.error.set(None);
                                        info.set(None);
                                    },
                                    "Sign up"
                                }
                                button {
                                    class: if mode() == AuthMode::Signin {
                                        "gs-wizard-tab gs-wizard-tab--active"
                                    } else {
                                        "gs-wizard-tab"
                                    },
                                    role: "tab",
                                    onclick: move |_| {
                                        mode.set(AuthMode::Signin);
                                        onboarding.auth_mode.set(AuthMode::Signin);
                                        local_error.set(None);
                                        auth.error.set(None);
                                        info.set(None);
                                    },
                                    "Sign in"
                                }
                            }

                            if let Some(err) = local_error.read().clone().or_else(|| auth.error.read().clone()) {
                                p { class: "gs-error", "{err}" }
                            }
                            if let Some(msg) = info.read().clone() {
                                p { class: "gs-wizard-form__info", "{msg}" }
                            }

                            form {
                                class: "gs-wizard-form gs-wizard-form--glass",
                                onsubmit: move |e| e.prevent_default(),

                                if mode() == AuthMode::Signup {
                                    label { class: "gs-wizard-glass-field",
                                        span { class: "gs-wizard-glass-field__label", "Full name" }
                                        span { class: "gs-wizard-glass-field__shell",
                                            i { class: "fa-regular fa-user gs-wizard-glass-field__icon", aria_hidden: "true" }
                                            input {
                                                class: "gs-wizard-glass-field__input",
                                                value: "{name}",
                                                oninput: move |e| name.set(e.value()),
                                                autocomplete: "name",
                                                placeholder: "Full name",
                                            }
                                        }
                                    }
                                }

                                label { class: "gs-wizard-glass-field",
                                    span { class: "gs-wizard-glass-field__label", "Email" }
                                    span { class: "gs-wizard-glass-field__shell",
                                        i { class: "fa-regular fa-envelope gs-wizard-glass-field__icon", aria_hidden: "true" }
                                        input {
                                            class: "gs-wizard-glass-field__input",
                                            r#type: "email",
                                            value: "{email}",
                                            oninput: move |e| email.set(e.value()),
                                            autocomplete: "email",
                                            placeholder: "Email",
                                        }
                                    }
                                }

                                label { class: "gs-wizard-glass-field gs-wizard-glass-field--password",
                                    span { class: "gs-wizard-glass-field__label", "Password" }
                                    span { class: "gs-wizard-glass-field__shell",
                                        i { class: "fa-solid fa-lock gs-wizard-glass-field__icon", aria_hidden: "true" }
                                        input {
                                            class: "gs-wizard-glass-field__input",
                                            r#type: if show_password() { "text" } else { "password" },
                                            value: "{password}",
                                            oninput: move |e| password.set(e.value()),
                                            autocomplete: if mode() == AuthMode::Signin { "current-password" } else { "new-password" },
                                            placeholder: "Password",
                                        }
                                    }
                                    button {
                                        class: "gs-wizard-password-toggle",
                                        r#type: "button",
                                        onclick: move |_| show_password.set(!show_password()),
                                        if show_password() { "Hide" } else { "Show" }
                                    }
                                }

                                if mode() == AuthMode::Signin {
                                    label { class: "gs-wizard-keep-signed-in",
                                        input {
                                            r#type: "checkbox",
                                            checked: remember(),
                                            onchange: move |e| remember.set(e.checked()),
                                        }
                                        span { "Keep me signed in" }
                                    }
                                }

                                button {
                                    class: "gs-btn gs-btn--primary gs-wizard-step__submit gs-wizard-glass-submit",
                                    r#type: "button",
                                    disabled: (auth.busy)(),
                                    onclick: move |_| {
                                        let email_val = email.read().trim().to_lowercase();
                                        let password_val = password.read().clone();
                                        let name_val = name.read().clone();
                                        let is_signup = mode() == AuthMode::Signup;
                                        spawn(async move {
                                            auth.busy.set(true);
                                            auth.error.set(None);
                                            local_error.set(None);
                                            info.set(None);
                                            if is_signup {
                                                match auth_api::register(&name_val, &email_val, &password_val).await {
                                                    Ok(()) => {
                                                        let resend = auth_api::resend_verification(&email_val).await;
                                                        pending_email.set(email_val.clone());
                                                        phase.set(WelcomePhase::CheckEmail);
                                                        if let Ok((msg, link)) = resend {
                                                            info.set(Some(msg));
                                                            dev_link.set(link);
                                                        }
                                                    }
                                                    Err(err) => {
                                                        local_error.set(Some(crate::auth_session::describe_session_error(&err)));
                                                    }
                                                }
                                            } else {
                                                match auth_api::login(&email_val, &password_val).await {
                                                    Ok(session) => {
                                                        auth.set_session(session.clone());
                                                        if let Some(route) = onboarding.handle_post_auth(&session) {
                                                            let _ = nav.replace(route);
                                                        }
                                                    }
                                                    Err(err) if auth_api::is_email_not_verified_error(&err) => {
                                                        pending_email.set(email_val);
                                                        phase.set(WelcomePhase::CheckEmail);
                                                        info.set(Some(
                                                            "Confirm your email before signing in. Use resend if you did not receive the message.".into(),
                                                        ));
                                                    }
                                                    Err(err) => {
                                                        local_error.set(Some(crate::auth_session::describe_session_error(&err)));
                                                    }
                                                }
                                            }
                                            auth.busy.set(false);
                                        });
                                    },
                                    if (auth.busy)() {
                                        "Please wait…"
                                    } else if mode() == AuthMode::Signin {
                                        "Sign in"
                                    } else {
                                        "Create account"
                                    }
                                }

                                if mode() == AuthMode::Signin {
                                    div { class: "gs-wizard-forgot-row",
                                        button {
                                            class: "gs-wizard-forgot-link",
                                            r#type: "button",
                                            onclick: move |_| {
                                                phase.set(WelcomePhase::ForgotUsername);
                                                local_error.set(None);
                                                info.set(None);
                                            },
                                            "Forgot username?"
                                        }
                                        span { class: "gs-wizard-forgot-sep", "or" }
                                        button {
                                            class: "gs-wizard-forgot-link",
                                            r#type: "button",
                                            onclick: move |_| {
                                                phase.set(WelcomePhase::ForgotPassword);
                                                local_error.set(None);
                                                info.set(None);
                                                reset_dev_link.set(None);
                                            },
                                            "Forgot password?"
                                        }
                                    }
                                }
                            }

                            div { class: "gs-wizard-oauth",
                                div { class: "gs-wizard-oauth__divider",
                                    span {
                                        if mode() == AuthMode::Signup { "or sign up with" } else { "or continue with" }
                                    }
                                }
                                OAuthGlassPanel {
                                    remember: remember(),
                                    on_error: move |err| {
                                        local_error.set(Some(err));
                                        auth.error.set(None);
                                    },
                                    on_success: move |_| {
                                        let session = auth.session.read().clone();
                                        if session.is_signed_in() {
                                            if let Some(route) = onboarding.handle_post_auth(&session) {
                                                let _ = nav.replace(route);
                                            }
                                        }
                                    },
                                }
                            }
                        }
                    },
                }
            }
        }
    }
}
