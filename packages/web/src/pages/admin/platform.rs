use dioxus::prelude::*;
use serde_json::Value;

use crate::{
    api::admin::{bearer_token, platform::{self, PlatformConfigSnapshot}},
    auth_session::AuthContext,
    components::admin::{
        AdminShell, AdminStepperModal, ConfigKeysEditor, PLATFORM_CONFIG_KEYS,
    },
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn setting_display(settings: &Value, key: &str) -> String {
    settings
        .get(key)
        .map(|v| v.to_string())
        .unwrap_or_else(|| "—".into())
}

#[component]
pub fn AdminPlatform() -> Element {
    let auth = AuthContext::use_auth();
    let mut snapshot = use_signal(|| None::<PlatformConfigSnapshot>);
    let mut settings = use_signal(|| Value::Object(serde_json::Map::new()));
    let mut allowlisted = use_signal(|| String::from("—"));
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    let mut propose_open = use_signal(|| false);
    let mut propose_step = use_signal(|| 1_u32);
    let mut propose_settings = use_signal(|| Value::Object(serde_json::Map::new()));

    use_effect(move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => {
                    let runtime = platform::fetch_runtime(&token).await;
                    let settings_resp = platform::fetch_settings(&token).await;
                    match (runtime, settings_resp) {
                        (Ok(data), Ok(cfg)) => {
                            snapshot.set(Some(data));
                            allowlisted.set(cfg.allowlisted_keys.join(", "));
                            settings.set(cfg.settings.clone());
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
    });

    let mut reset_propose = move || {
        propose_open.set(false);
        propose_step.set(1);
        propose_settings.set(settings.read().clone());
    };

    let on_propose = move |_| {
        let config = propose_settings.read().clone();
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match platform::propose_config_update(&token, &config).await {
                    Ok(resp) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Proposal {} submitted — {} approvals required",
                            resp.proposal_id, resp.required_approvals
                        )));
                        reset_propose();
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

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Platform config" }
                p { class: "gs-page-lead",
                    "Runtime status is read-only. Allowlisted platform toggles require a governance proposal (≥3 Geosyntra admins)."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading platform config…" }
                } else {
                    div { class: "gs-page-toolbar",
                        span { class: "gs-hint",
                            "Allowlisted keys: "
                            code { "{allowlisted}" }
                        }
                        button {
                            class: "gs-btn gs-btn--primary",
                            r#type: "button",
                            onclick: move |_| {
                                propose_settings.set(settings.read().clone());
                                propose_step.set(1);
                                propose_open.set(true);
                            },
                            "Propose config update"
                        }
                    }

                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Key" }
                                    th { "Value" }
                                }
                            }
                            tbody {
                                for key in PLATFORM_CONFIG_KEYS.iter() {
                                    {
                                        let val = setting_display(&*settings.read(), *key);
                                        rsx! {
                                            tr { key: "{key}",
                                                td { code { "{key}" } }
                                                td { "{val}" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    AdminStepperModal {
                        open: *propose_open.read(),
                        title: String::from("Propose platform config update"),
                        step: *propose_step.read(),
                        total_steps: 2,
                        submitting: *submitting.read(),
                        submit_label: String::from("Propose update"),
                        on_close: move |_| reset_propose(),
                        on_back: move |_| propose_step.set(propose_step().saturating_sub(1)),
                        on_next: move |_| propose_step.set(propose_step() + 1),
                        on_submit: on_propose,
                        if *propose_step.read() == 1 {
                            ConfigKeysEditor {
                                keys: PLATFORM_CONFIG_KEYS,
                                values: propose_settings.read().clone(),
                                on_change: move |v| propose_settings.set(v),
                            }
                        } else {
                            dl { class: "gs-detail-grid",
                                for key in PLATFORM_CONFIG_KEYS.iter() {
                                    {
                                        let val = setting_display(&*propose_settings.read(), *key);
                                        rsx! {
                                            div { class: "gs-detail-row", key: "{key}",
                                                dt { class: "gs-detail-label", "{key}" }
                                                dd { class: "gs-detail-value", "{val}" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if let Some(data) = snapshot.read().clone() {
                        {
                            let gateway_json = serde_json::to_string_pretty(&data.gateway)
                                .unwrap_or_else(|_| "{}".into());
                            let capabilities_json = serde_json::to_string_pretty(&data.capabilities)
                                .unwrap_or_else(|_| "{}".into());
                            let bindings_json = serde_json::to_string_pretty(&data.bindings)
                                .unwrap_or_else(|_| "[]".into());
                            let env_label = data
                                .environment
                                .clone()
                                .unwrap_or_else(|| "—".into());
                            rsx! {
                                div { class: "gs-form-card",
                                    h2 { "Runtime" }
                                    p { "Environment: {env_label}" }
                                    p { "Production mode: {data.is_production}" }
                                    if !data.ok {
                                        p { class: "gs-error", "Required production bindings are missing." }
                                    }
                                }

                                div { class: "gs-form-card",
                                    h2 { "Gateway capabilities" }
                                    pre { class: "gs-code-block", "{gateway_json}" }
                                }

                                div { class: "gs-form-card",
                                    h2 { "Platform capabilities" }
                                    pre { class: "gs-code-block", "{capabilities_json}" }
                                }

                                div { class: "gs-form-card",
                                    h2 { "Environment bindings" }
                                    if data.required_present.is_empty() && data.required_missing.is_empty() {
                                        p { class: "gs-hint", "No binding audit rows returned." }
                                    } else {
                                        if !data.required_present.is_empty() {
                                            p { class: "gs-flash", "Configured: {data.required_present.len()} binding(s)" }
                                        }
                                        if !data.required_missing.is_empty() {
                                            p { class: "gs-error", "Missing required: {data.required_missing.len()} binding(s)" }
                                        }
                                        pre { class: "gs-code-block", "{bindings_json}" }
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
