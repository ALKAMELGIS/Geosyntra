use dioxus::prelude::*;
use serde::Deserialize;

use crate::{
    api::admin::bearer_token,
    api_client::ApiClient,
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

#[derive(Debug, Clone, Deserialize)]
struct TokenStatusRow {
    name: String,
    label: String,
    category: String,
    configured: bool,
    active: bool,
    #[serde(rename = "envOnly")]
    env_only: bool,
    source: String,
}

#[derive(Debug, Deserialize)]
struct TokensStatusResponse {
    tokens: Vec<TokenStatusRow>,
    #[serde(rename = "storeReady")]
    store_ready: bool,
    encrypted: bool,
}

#[component]
pub fn AdminTokens() -> Element {
    let auth = AuthContext::use_auth();
    let mut rows = use_signal(Vec::<TokenStatusRow>::new);
    let mut store_ready = use_signal(|| false);
    let mut encrypted = use_signal(|| false);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    use_effect(move || {
        spawn(async move {
            loading.set(true);
            match token_from(&auth) {
                Ok(token) => {
                    let client = ApiClient::from_env();
                    match client
                        .get_json::<TokensStatusResponse>("/api/system/tokens/status", Some(&token))
                        .await
                    {
                        Ok(data) => {
                            rows.set(data.tokens);
                            store_ready.set(data.store_ready);
                            encrypted.set(data.encrypted);
                            loading.set(false);
                        }
                        Err(err) => {
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

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
            h1 { class: "gs-page-title", "System tokens" }
            p { class: "gs-page-lead",
                "Owner-only registry status. Encrypted vault: "
                if *encrypted.read() { "yes" } else { "no" }
                " · Store ready: "
                if *store_ready.read() { "yes" } else { "no" }
                "."
            }

            if let Some(err) = error.read().clone() {
                p { class: "gs-error", "{err}" }
            }

            if *loading.read() {
                p { class: "gs-hint", "Loading token registry…" }
            } else {
                div { class: "gs-table-wrap",
                    table { class: "gs-table",
                        thead {
                            tr {
                                th { "Token" }
                                th { "Category" }
                                th { "Configured" }
                                th { "Source" }
                            }
                        }
                        tbody {
                            for row in rows.read().iter().cloned() {
                                tr { key: "{row.name}",
                                    td {
                                        strong { "{row.label}" }
                                        span { class: "gs-table-muted", " ({row.name})" }
                                    }
                                    td { "{row.category}" }
                                    td {
                                        if row.configured {
                                            span { class: "gs-badge gs-badge--active", "Configured" }
                                        } else {
                                            span { class: "gs-badge gs-badge--draft", "Missing" }
                                        }
                                        if row.env_only {
                                            span { class: "gs-badge gs-badge--pending", "Env only" }
                                        }
                                    }
                                    td { class: "gs-table-muted", "{row.source}" }
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
