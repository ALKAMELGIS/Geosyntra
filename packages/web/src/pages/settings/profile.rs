use dioxus::prelude::*;

use crate::{
    api::{
        account::profile_extra::{fetch_profile_extra, put_profile_extra},
        admin::bearer_token,
        billing::{fetch_billing_me, BillingMe},
    },
    auth_api::change_password,
    auth_session::{AuthContext, AuthSession},
    components::settings::SettingsShell,
    error_display::display_api_error,
    onboarding::{
        home_wizard_search, replace_location_search, AuthMode, WizardStep,
    },
    routes::Route,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum ProfileTab {
    Overview,
    Personal,
    Billing,
    Security,
}

#[component]
pub fn SettingsProfile() -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();
    let session = auth.session.read().clone();
    let mut tab = use_signal(|| ProfileTab::Overview);
    let mut billing = use_signal(|| None::<BillingMe>);
    let mut billing_loading = use_signal(|| true);
    let mut billing_error = use_signal(|| None::<String>);

    let mut extra_phone = use_signal(String::new);
    let mut extra_org = use_signal(String::new);
    let mut extra_notice = use_signal(|| None::<String>);

    use_effect({
        let session = session.clone();
        move || {
            let token = match bearer_token(&session) {
                Ok(t) => t,
                Err(_) => return,
            };
            let email = session.email.clone().unwrap_or_default();
            spawn(async move {
                if let Ok(extra) = fetch_profile_extra(&token, &email).await {
                    extra_phone.set(
                        extra
                            .get("phone")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    );
                    extra_org.set(
                        extra
                            .get("organization")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                    );
                }
            });
        }
    });

    use_effect({
        let session = session.clone();
        move || {
            let token = match bearer_token(&session) {
                Ok(t) => t,
                Err(err) => {
                    billing_error.set(Some(display_api_error(&err)));
                    billing_loading.set(false);
                    return;
                }
            };
            spawn(async move {
                billing_loading.set(true);
                match fetch_billing_me(&token).await {
                    Ok(me) => {
                        billing.set(Some(me));
                        billing_error.set(None);
                        billing_loading.set(false);
                    }
                    Err(err) => {
                        billing_error.set(Some(display_api_error(&err)));
                        billing_loading.set(false);
                    }
                }
            });
        }
    });

    let pricing_wizard = home_wizard_search(WizardStep::Pricing, AuthMode::Signin, true, None);
    let verified = session.is_email_verified();

    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "Profile" }
                p { class: "gs-page-lead", "Account overview, billing, and security." }

                if !verified {
                    div { class: "gs-flash gs-flash--warn",
                        p { "Verify your email to unlock full workspace access." }
                        Link {
                            to: Route::VerifyEmail { token: None },
                            class: "gs-btn gs-btn--ghost",
                            "Open verification"
                        }
                    }
                }

                nav { class: "gs-tabs",
                    button {
                        class: if *tab.read() == ProfileTab::Overview { "gs-tab gs-tab--active" } else { "gs-tab" },
                        onclick: move |_| tab.set(ProfileTab::Overview),
                        "Overview"
                    }
                    button {
                        class: if *tab.read() == ProfileTab::Personal { "gs-tab gs-tab--active" } else { "gs-tab" },
                        onclick: move |_| tab.set(ProfileTab::Personal),
                        "Personal"
                    }
                    button {
                        class: if *tab.read() == ProfileTab::Billing { "gs-tab gs-tab--active" } else { "gs-tab" },
                        onclick: move |_| tab.set(ProfileTab::Billing),
                        "Billing"
                    }
                    button {
                        class: if *tab.read() == ProfileTab::Security { "gs-tab gs-tab--active" } else { "gs-tab" },
                        onclick: move |_| tab.set(ProfileTab::Security),
                        "Security"
                    }
                }

                match *tab.read() {
                    ProfileTab::Overview => rsx! {
                        div { class: "gs-card",
                            dl { class: "gs-dl",
                                dt { "Name" }
                                dd { "{session.display_name()}" }
                                dt { "Email" }
                                dd { "{session.email.clone().unwrap_or_else(|| \"—\".into())}" }
                                dt { "Role" }
                                dd {
                                    "{session.role.clone().unwrap_or_else(|| session.role_slug.clone().unwrap_or_else(|| \"—\".into()))}"
                                }
                                dt { "Status" }
                                dd { "{session.status.clone().unwrap_or_else(|| \"—\".into())}" }
                                dt { "Tenant" }
                                dd { code { "{session.active_tenant()}" } }
                                dt { "User ID" }
                                dd { code { "{session.user_id.clone().unwrap_or_else(|| \"—\".into())}" } }
                            }
                        }
                    },
                    ProfileTab::Personal => {
                        let session_save = session.clone();
                        rsx! {
                            if let Some(note) = extra_notice.read().clone() {
                                p { class: "gs-flash", "{note}" }
                            }
                            div { class: "gs-card",
                                h2 { class: "gs-card-title", "Extended profile" }
                                div { class: "gs-field",
                                    label { "Phone" }
                                    input {
                                        value: "{extra_phone}",
                                        oninput: move |e| extra_phone.set(e.value()),
                                    }
                                }
                                div { class: "gs-field",
                                    label { "Organization" }
                                    input {
                                        value: "{extra_org}",
                                        oninput: move |e| extra_org.set(e.value()),
                                    }
                                }
                                button {
                                    class: "gs-btn gs-btn--primary",
                                    onclick: move |_| {
                                        let session = session_save.clone();
                                        let phone = extra_phone.read().clone();
                                        let org = extra_org.read().clone();
                                        spawn(async move {
                                            let token = match bearer_token(&session) {
                                                Ok(t) => t,
                                                Err(err) => {
                                                    extra_notice.set(Some(display_api_error(&err)));
                                                    return;
                                                }
                                            };
                                            let email = session.email.clone().unwrap_or_default();
                                            let patch = serde_json::json!({
                                                "phone": phone,
                                                "organization": org,
                                            });
                                            match put_profile_extra(&token, &email, &patch).await {
                                                Ok(_) => extra_notice.set(Some("Profile saved.".into())),
                                                Err(err) => extra_notice.set(Some(display_api_error(&err))),
                                            }
                                        });
                                    },
                                    "Save personal info"
                                }
                            }
                        }
                    },
                    ProfileTab::Billing => rsx! {
                        if *billing_loading.read() {
                            p { class: "gs-hint", "Loading subscription…" }
                        } else if let Some(err) = billing_error.read().clone() {
                            p { class: "gs-error", "{err}" }
                        } else if let Some(me) = billing.read().clone() {
                            div { class: "gs-card",
                                h2 { class: "gs-card-title", "Subscription" }
                                dl { class: "gs-dl",
                                    dt { "Plan" }
                                    dd { "{me.subscription.plan.clone().unwrap_or_else(|| \"trial\".into())}" }
                                    dt { "Status" }
                                    dd { "{me.subscription.status.clone().unwrap_or_else(|| \"—\".into())}" }
                                    dt { "Trial ends" }
                                    dd { "{me.subscription.trial_ends_at.clone().unwrap_or_else(|| \"—\".into())}" }
                                    dt { "Period end" }
                                    dd { "{me.subscription.current_period_end.clone().unwrap_or_else(|| \"—\".into())}" }
                                }
                                if let Some(usage) = me.subscription.usage.clone() {
                                    h3 { class: "gs-card-title", "Usage" }
                                    dl { class: "gs-dl",
                                        dt { "AI queries" }
                                        dd { "{usage.ai_queries.unwrap_or(0)}" }
                                        dt { "Grounding calls" }
                                        dd { "{usage.grounding_calls.unwrap_or(0)}" }
                                        dt { "Exports" }
                                        dd { "{usage.exports.unwrap_or(0)}" }
                                    }
                                }
                                Link {
                                    to: Route::Landing {},
                                    class: "gs-btn gs-btn--primary",
                                    onclick: move |_| {
                                        replace_location_search(&pricing_wizard);
                                        let _ = nav.push(Route::Landing {});
                                    },
                                    "Upgrade plan"
                                }
                            }
                        }
                    },
                    ProfileTab::Security => rsx! {
                        ChangePasswordForm { session: session.clone() }
                        div { class: "gs-card",
                            h2 { class: "gs-card-title", "Forgot password" }
                            Link {
                                to: Route::ResetPassword { token: None },
                                class: "gs-btn gs-btn--ghost",
                                "Reset via email"
                            }
                        }
                        div { class: "gs-card",
                            h2 { class: "gs-card-title", "Session" }
                            p { class: "gs-hint",
                                "Signed in on this device. Sign out from the dashboard menu to end the session."
                            }
                            Link {
                                to: Route::Dashboard {},
                                class: "gs-btn gs-btn--ghost",
                                "Back to dashboard"
                            }
                        }
                    },
                }
            }
        }
    }
}

#[component]
fn ChangePasswordForm(session: AuthSession) -> Element {
    let mut current = use_signal(String::new);
    let mut new_pw = use_signal(String::new);
    let mut notice = use_signal(|| None::<String>);
    let mut busy = use_signal(|| false);

    rsx! {
        div { class: "gs-card",
            h2 { class: "gs-card-title", "Change password" }
            if let Some(note) = notice.read().clone() {
                p { class: "gs-flash", "{note}" }
            }
            div { class: "gs-field",
                label { "Current password" }
                input {
                    r#type: "password",
                    value: "{current}",
                    oninput: move |e| current.set(e.value()),
                }
            }
            div { class: "gs-field",
                label { "New password" }
                input {
                    r#type: "password",
                    value: "{new_pw}",
                    oninput: move |e| new_pw.set(e.value()),
                }
            }
            button {
                class: "gs-btn gs-btn--primary",
                disabled: *busy.read(),
                onclick: move |_| {
                    let session = session.clone();
                    let cur = current.read().clone();
                    let new_val = new_pw.read().clone();
                    let email = session.email.clone().unwrap_or_default();
                    spawn(async move {
                        busy.set(true);
                        let token = match bearer_token(&session) {
                            Ok(t) => t,
                            Err(err) => {
                                notice.set(Some(display_api_error(&err)));
                                busy.set(false);
                                return;
                            }
                        };
                        match change_password(&token, &email, &cur, &new_val).await {
                            Ok(msg) => {
                                notice.set(Some(msg));
                                current.set(String::new());
                                new_pw.set(String::new());
                                busy.set(false);
                            }
                            Err(err) => {
                                notice.set(Some(display_api_error(&err)));
                                busy.set(false);
                            }
                        }
                    });
                },
                if *busy.read() { "Updating…" } else { "Update password" }
            }
        }
    }
}
