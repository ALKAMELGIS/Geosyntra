use dioxus::prelude::*;

use crate::{
    api::admin::{audit, bearer_token},
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn format_time(raw: &Option<String>) -> String {
    raw.clone().unwrap_or_else(|| "—".into())
}

#[component]
pub fn AdminAudit() -> Element {
    let auth = AuthContext::use_auth();
    let mut rows = use_signal(Vec::<audit::AuditEntry>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    use_effect(move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match audit::list_audit(&token, 200).await {
                    Ok(list) => {
                        rows.set(list);
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

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Audit log" }
                p { class: "gs-page-lead", "Recent security and administration events." }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading audit entries…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No audit entries returned from the API." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Time" }
                                    th { "Actor" }
                                    th { "Action" }
                                    th { "Target" }
                                }
                            }
                            tbody {
                                for (idx, row) in rows.read().iter().enumerate() {
                                    tr { key: "{idx}",
                                        td { class: "gs-table-muted",
                                            "{format_time(&row.at)}"
                                        }
                                        td {
                                            "{row.actor.clone().unwrap_or_else(|| \"—\".into())}"
                                        }
                                        td {
                                            "{row.action.clone().unwrap_or_else(|| \"—\".into())}"
                                        }
                                        td { class: "gs-table-muted",
                                            "{row.target.clone().unwrap_or_else(|| \"—\".into())}"
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
