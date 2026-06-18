use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::{OnboardingContext, WizardOpenOptions, WizardStep, AuthMode},
    workspace::{read_workspace_state, is_platform_owner, sync_trial_expiry, trial_days_remaining, WorkspaceLifecycle},
};

fn display_initials(session: &crate::auth_session::AuthSession) -> String {
    let name = session.display_name();
    let parts: Vec<_> = name.split_whitespace().collect();
    if parts.len() >= 2 {
        format!(
            "{}{}",
            parts[0].chars().next().unwrap_or('U'),
            parts[1].chars().next().unwrap_or('U')
        )
    } else {
        name.chars().next().unwrap_or('U').to_string()
    }
}

#[component]
pub fn LandingStatusBar() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();
    let mut menu_open = use_signal(|| false);
    let session = auth.session.read().clone();

    if !session.is_signed_in() {
        return rsx! {
            div { class: "gs-status-bar gs-status-bar--guest",
                button {
                    class: if menu_open() { "gs-status-bar__trigger gs-status-bar__trigger--open" } else { "gs-status-bar__trigger" },
                    aria_label: "Account menu",
                    aria_expanded: "{menu_open()}",
                    onclick: move |_| menu_open.set(!menu_open()),
                    span { class: "gs-status-bar__avatar gs-status-bar__avatar--guest", "?" }
                }
                if menu_open() {
                    div { class: "gs-status-bar__menu",
                        button {
                            class: "gs-status-bar__menu-item",
                            onclick: move |_| {
                                menu_open.set(false);
                                onboarding.open_wizard(
                                    &auth.session.read(),
                                    WizardOpenOptions {
                                        step: Some(WizardStep::Welcome),
                                        auth_mode: Some(AuthMode::Signin),
                                        ..Default::default()
                                    },
                                );
                            },
                            "Sign in"
                        }
                        button {
                            class: "gs-status-bar__menu-item",
                            onclick: move |_| {
                                menu_open.set(false);
                                onboarding.open_wizard(
                                    &auth.session.read(),
                                    WizardOpenOptions {
                                        step: Some(WizardStep::Welcome),
                                        auth_mode: Some(AuthMode::Signup),
                                        ..Default::default()
                                    },
                                );
                            },
                            "Register"
                        }
                    }
                }
            }
        };
    }

    let email = session.email.as_deref().unwrap_or("");
    let tenant = session.active_tenant();
    let ws = sync_trial_expiry(tenant, email).or_else(|| read_workspace_state(tenant, email));
    let ready = onboarding.workspace_ready(&session) || is_platform_owner(&session);
    let days = ws.as_ref().and_then(|s| trial_days_remaining(s));
    let display_name = session.display_name();
    let initials = display_initials(&session);
    let meta = if !ready {
        "Live session · finish setup".to_string()
    } else if ws.as_ref().is_some_and(|w| w.lifecycle == WorkspaceLifecycle::Trialing) {
        days.map(|d| format!("Trial active · {d} day{} remaining", if d == 1 { "" } else { "s" }))
            .unwrap_or_else(|| "Trial active".into())
    } else {
        "Pro · workspace ready".into()
    };
    let cta = if ready { "Open workspace" } else { "Finish setup" };

    rsx! {
        div { class: "gs-status-bar gs-status-bar--signed-in",
            button {
                class: if menu_open() { "gs-status-bar__trigger gs-status-bar__trigger--open" } else { "gs-status-bar__trigger" },
                aria_label: "Account menu for {display_name}",
                aria_expanded: "{menu_open()}",
                onclick: move |_| menu_open.set(!menu_open()),
                span { class: "gs-status-bar__avatar", "{initials}" }
            }
            if menu_open() {
                div { class: "gs-status-bar__panel",
                    div { class: "gs-status-bar__identity",
                        span { class: "gs-status-bar__avatar gs-status-bar__avatar--lg", "{initials}" }
                        div {
                            p { class: "gs-status-bar__welcome",
                                "Welcome, "
                                span { class: "gs-status-bar__name", "{display_name}" }
                            }
                            p { class: "gs-status-bar__meta", "{meta}" }
                        }
                    }
                    div { class: "gs-status-bar__actions",
                        button {
                            class: "gs-btn gs-btn--primary gs-status-bar__cta",
                            onclick: move |_| {
                                menu_open.set(false);
                                if ready {
                                    let session = auth.session.read().clone();
                                    if let Some(route) = onboarding.enter_workspace(&session) {
                                        let _ = nav.push(route);
                                    }
                                } else {
                                    onboarding.open_wizard(
                                        &auth.session.read(),
                                        WizardOpenOptions {
                                            step: Some(WizardStep::Pricing),
                                            ..Default::default()
                                        },
                                    );
                                }
                            },
                            "{cta}"
                        }
                    }
                    button {
                        class: "gs-status-bar__signout",
                        onclick: move |_| {
                            menu_open.set(false);
                            auth.sign_out();
                            onboarding.open_wizard(
                                &crate::auth_session::AuthSession::default(),
                                WizardOpenOptions {
                                    step: Some(WizardStep::Welcome),
                                    auth_mode: Some(AuthMode::Signin),
                                    ..Default::default()
                                },
                            );
                        },
                        "Sign Out"
                    }
                }
            }
        }
    }
}
