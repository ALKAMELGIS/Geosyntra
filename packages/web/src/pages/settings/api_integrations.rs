use dioxus::prelude::*;

use crate::{
    api::{
        admin::bearer_token,
        settings::config::{fetch_config_status, provider_rows},
    },
    auth_session::AuthContext,
    components::settings::SettingsShell,
    error_display::display_api_error,
};

#[component]
pub fn SettingsApiIntegrations() -> Element {
    let auth = AuthContext::use_auth();
    let session = auth.session.read().clone();
    let mut providers = use_signal(Vec::new);
    let mut env_rows = use_signal(Vec::new);
    let mut gateway_mode = use_signal(|| false);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    let can_integrations = session.can_manage_api_integrations();

    use_effect(move || {
        if !can_integrations {
            loading.set(false);
            return;
        }
        spawn(async move {
            loading.set(true);
            error.set(None);
            match bearer_token(&auth.session.read()) {
                Ok(token) => match fetch_config_status(&token).await {
                    Ok(status) => {
                        providers.set(provider_rows(&status.capabilities));
                        env_rows.set(status.environment);
                        gateway_mode.set(status.gateway_mode.unwrap_or(false));
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
    });

    if !can_integrations {
        return rsx! {
            SettingsShell {
                div { class: "gs-settings-page",
                    h1 { class: "gs-page-title", "API integrations" }
                    p { class: "gs-hint", "Admin settings or token read permission is required for API Manager." }
                }
            }
        };
    }

    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "API integrations" }
                p { class: "gs-page-lead",
                    "Gateway capabilities from server environment bindings (read-only)."
                }

                if *gateway_mode.read() {
                    p { class: "gs-flash", "Gateway proxy mode is enabled on the API." }
                }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading platform capabilities…" }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Provider" }
                                    th { "Status" }
                                }
                            }
                            tbody {
                                for row in providers.read().iter().cloned() {
                                    tr { key: "{row.id}",
                                        td {
                                            strong { "{row.label}" }
                                            br {}
                                            code { class: "gs-role-slug", "{row.id}" }
                                        }
                                        td {
                                            if row.configured {
                                                span { class: "gs-badge gs-badge--active", "Configured" }
                                            } else {
                                                span { class: "gs-badge gs-badge--draft", "Not configured" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    div { class: "gs-card",
                        h2 { class: "gs-card-title", "Environment bindings" }
                        div { class: "gs-table-wrap",
                            table { class: "gs-table",
                                thead {
                                    tr {
                                        th { "Token" }
                                        th { "Env key" }
                                        th { "Status" }
                                    }
                                }
                                tbody {
                                    for (idx, row) in env_rows.read().iter().enumerate() {
                                        tr { key: "{idx}",
                                            td { "{row.name.clone().unwrap_or_else(|| \"—\".into())}" }
                                            td { class: "gs-table-muted",
                                                code { "{row.env_key.clone().unwrap_or_else(|| \"—\".into())}" }
                                            }
                                            td {
                                                if row.configured.unwrap_or(false) {
                                                    span { class: "gs-badge gs-badge--active", "Set" }
                                                } else {
                                                    span { class: "gs-badge gs-badge--pending", "Missing" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        p { class: "gs-hint",
                            "Tokens are configured via server environment variables. "
                            "Client-side vault editing remains in the legacy React UI until a future iteration."
                        }
                    }
                }
            }
        }
    }
}
