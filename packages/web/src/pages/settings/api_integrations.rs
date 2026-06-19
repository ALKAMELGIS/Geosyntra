use dioxus::prelude::*;

use crate::{
    api::{
        admin::bearer_token,
        settings::{
            config::{fetch_config_status, provider_rows},
            user_tokens::{delete_user_token, list_user_tokens, upsert_user_token, UserApiToken},
        },
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
    let mut user_tokens = use_signal(Vec::<UserApiToken>::new);
    let mut editing_provider = use_signal(|| None::<String>);
    let mut token_draft = use_signal(String::new);
    let mut token_busy = use_signal(|| false);
    let mut token_notice = use_signal(|| None::<String>);

    let can_integrations = session.can_manage_api_integrations();
    let is_owner = session.is_owner();

    use_effect({
        let session = session.clone();
        move || {
            if !can_integrations {
                loading.set(false);
                return;
            }
            let token = match bearer_token(&session) {
                Ok(t) => Some(t),
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                    return;
                }
            };
            spawn(async move {
                loading.set(true);
                error.set(None);
                if let Some(token) = token {
                    match fetch_config_status(&token).await {
                        Ok(status) => {
                            providers.set(provider_rows(&status.capabilities));
                            env_rows.set(status.environment);
                            gateway_mode.set(status.gateway_mode.unwrap_or(false));
                            if is_owner {
                                if let Ok(tokens) = list_user_tokens(&token).await {
                                    user_tokens.set(tokens);
                                }
                            }
                            loading.set(false);
                        }
                        Err(err) => {
                            error.set(Some(display_api_error(&err)));
                            loading.set(false);
                        }
                    }
                }
            });
        }
    });

    let save_token = {
        let session = session.clone();
        move |_| {
            let provider = editing_provider.read().clone();
            let value = token_draft.read().clone();
            let Some(provider) = provider.filter(|p| !p.is_empty()) else {
                return;
            };
            if value.trim().is_empty() {
                token_notice.set(Some("Enter a token value.".into()));
                return;
            }
            let token = match bearer_token(&session) {
                Ok(t) => t,
                Err(err) => {
                    token_notice.set(Some(display_api_error(&err)));
                    return;
                }
            };
            spawn(async move {
                token_busy.set(true);
                token_notice.set(None);
                match upsert_user_token(&token, &provider, &value).await {
                    Ok(()) => {
                        if let Ok(tokens) = list_user_tokens(&token).await {
                            user_tokens.set(tokens);
                        }
                        editing_provider.set(None);
                        token_draft.set(String::new());
                        token_notice.set(Some(format!("Saved {provider} token.")));
                        token_busy.set(false);
                    }
                    Err(err) => {
                        token_notice.set(Some(display_api_error(&err)));
                        token_busy.set(false);
                    }
                }
            });
        }
    };

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
                    "Platform capabilities and owner token vault."
                }

                if *gateway_mode.read() {
                    p { class: "gs-flash", "Gateway proxy mode is enabled on the API." }
                }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }
                if let Some(note) = token_notice.read().clone() {
                    p { class: "gs-flash", "{note}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading platform capabilities…" }
                } else {
                    if is_owner {
                        div { class: "gs-card",
                            h2 { class: "gs-card-title", "Owner token vault" }
                            p { class: "gs-hint",
                                "Per-user API keys stored encrypted in the platform database."
                            }
                            div { class: "gs-table-wrap",
                                table { class: "gs-table",
                                    thead {
                                        tr {
                                            th { "Provider" }
                                            th { "Status" }
                                            th { "Masked" }
                                            th { "Actions" }
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
                                                    if user_tokens.read().iter().any(|t| t.provider == row.id && t.configured.unwrap_or(false)) {
                                                        span { class: "gs-badge gs-badge--active", "Configured" }
                                                    } else if row.configured {
                                                        span { class: "gs-badge gs-badge--active", "Env configured" }
                                                    } else {
                                                        span { class: "gs-badge gs-badge--draft", "Not configured" }
                                                    }
                                                }
                                                td {
                                                    code {
                                                        "{user_tokens.read().iter().find(|t| t.provider == row.id).and_then(|t| t.masked.clone()).unwrap_or_else(|| \"—\".into())}"
                                                    }
                                                }
                                                td {
                                                    button {
                                                        class: "gs-btn gs-btn--ghost",
                                                        onclick: move |_| {
                                                            editing_provider.set(Some(row.id.clone()));
                                                            token_draft.set(String::new());
                                                        },
                                                        "Set token"
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if let Some(provider) = editing_provider.read().clone() {
                                div { class: "gs-field",
                                    label { "Token for {provider}" }
                                    input {
                                        r#type: "password",
                                        value: "{token_draft}",
                                        oninput: move |e| token_draft.set(e.value()),
                                        placeholder: "Paste API key…",
                                    }
                                    div { class: "gs-inline-actions",
                                        button {
                                            class: "gs-btn gs-btn--primary",
                                            disabled: *token_busy.read(),
                                            onclick: save_token,
                                            if *token_busy.read() { "Saving…" } else { "Save token" }
                                        }
                                        button {
                                            class: "gs-btn gs-btn--ghost",
                                            onclick: move |_| {
                                                editing_provider.set(None);
                                                token_draft.set(String::new());
                                            },
                                            "Cancel"
                                        }
                                        button {
                                            class: "gs-btn gs-btn--ghost",
                                            onclick: {
                                                let session = session.clone();
                                                move |_| {
                                                    let provider = provider.clone();
                                                    let token = match bearer_token(&session) {
                                                        Ok(t) => t,
                                                        Err(err) => {
                                                            token_notice.set(Some(display_api_error(&err)));
                                                            return;
                                                        }
                                                    };
                                                    spawn(async move {
                                                        token_busy.set(true);
                                                        match delete_user_token(&token, &provider).await {
                                                            Ok(()) => {
                                                                if let Ok(tokens) = list_user_tokens(&token).await {
                                                                    user_tokens.set(tokens);
                                                                }
                                                                editing_provider.set(None);
                                                                token_draft.set(String::new());
                                                                token_notice.set(Some(format!("Removed {provider} token.")));
                                                                token_busy.set(false);
                                                            }
                                                            Err(err) => {
                                                                token_notice.set(Some(display_api_error(&err)));
                                                                token_busy.set(false);
                                                            }
                                                        }
                                                    });
                                                }
                                            },
                                            "Remove"
                                        }
                                    }
                                }
                            }
                        }
                    }

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
                                    tr { key: "cap-{row.id}",
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
                    }
                }
            }
        }
    }
}
