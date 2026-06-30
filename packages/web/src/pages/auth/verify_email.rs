use dioxus::prelude::*;

use crate::{
    auth_api,
    auth_session::AuthContext,
    onboarding::{OnboardingContext, WizardStep},
    routes::Route,
};

#[component]
pub fn VerifyEmail(token: Option<String>) -> Element {
    let mut auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();
    let mut status = use_signal(|| "loading".to_string());
    let mut message = use_signal(String::new);
    let token_val = token.unwrap_or_default();

    use_effect(move || {
        let token = token_val.clone();
        if token.trim().is_empty() {
            status.set("error".into());
            message.set("Missing verification token.".into());
            return;
        }
        spawn(async move {
            match auth_api::verify_email(&token).await {
                Ok((session, pending)) => {
                    auth.set_session(session.clone());
                    if pending {
                        status.set("success".into());
                        message.set(
                            "Email verified. An administrator must approve your account before you can sign in."
                                .into(),
                        );
                        return;
                    }
                    status.set("success".into());
                    message.set("Email verified. Finishing workspace setup…".into());
                    if let Some(route) = onboarding.handle_post_auth(&session) {
                        let _ = nav.replace(route);
                    } else {
                        onboarding.open.set(true);
                        onboarding.step.set(WizardStep::Pricing);
                        let _ = nav.replace(Route::Landing {});
                    }
                }
                Err(err) => {
                    let msg = err.user_message();
                    if msg.to_ascii_lowercase().contains("expired") {
                        status.set("expired".into());
                    } else {
                        status.set("error".into());
                    }
                    message.set(msg);
                }
            }
        });
    });

    rsx! {
        div { class: "gs-app gs-auth",
            div { class: "gs-auth-card gs-auth-card--verify",
                h1 { class: "gs-page-title", "Verify email" }
                if status() == "loading" {
                    p { class: "gs-page-lead", "Confirming your email…" }
                } else if status() == "success" {
                    p { class: "gs-auth-success", "{message()}" }
                    Link { to: Route::Landing {}, class: "gs-btn gs-btn--primary",
                        "Continue to GeoSyntra"
                    }
                } else {
                    p { class: "gs-error", "{message()}" }
                    Link { to: Route::Landing {}, class: "gs-btn gs-btn--ghost",
                        "Back to home"
                    }
                }
            }
        }
    }
}
