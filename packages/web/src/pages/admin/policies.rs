use dioxus::prelude::*;

use crate::{
    api::admin::{bearer_token, policies::{self, PolicyRule}},
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
    routes::Route,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

#[component]
pub fn PolicyList() -> Element {
    let auth = AuthContext::use_auth();
    let tenant = auth.session.read().active_tenant().to_string();
    let nav = use_navigator();
    let mut versions = use_signal(Vec::<policies::PolicyVersionSummary>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut new_label = use_signal(String::new);
    let mut creating = use_signal(|| false);

    let reload = move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match policies::list_policies(&token).await {
                    Ok(rows) => {
                        versions.set(rows);
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
    };

    use_effect(move || {
        reload();
    });

    let on_create = move |_| {
        let label = new_label.read().trim().to_string();
        if label.is_empty() {
            error.set(Some("Label is required".into()));
            return;
        }
        spawn(async move {
            creating.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => {
                    let rules = vec![PolicyRule::new_draft("*", "*")];
                    match policies::create_policy(&token, &label, &rules).await {
                        Ok(resp) => {
                            creating.set(false);
                            let proposal_id = resp
                                .get("proposalId")
                                .and_then(|v| v.as_str())
                                .unwrap_or("?");
                            let required = resp
                                .get("requiredApprovals")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(3);
                            flash.set(Some(format!(
                                "Proposal {proposal_id} submitted — {required} approvals required"
                            )));
                            new_label.set(String::new());
                            reload();
                        }
                        Err(err) => {
                            creating.set(false);
                            error.set(Some(display_api_error(&err)));
                        }
                    }
                }
                Err(err) => {
                    creating.set(false);
                    error.set(Some(display_api_error(&err)));
                }
            }
        });
    };

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
            h1 { class: "gs-page-title", "Policy versions" }
            p { class: "gs-page-lead",
                "Tenant "
                code { "{tenant}" }
                " ABAC policy versions backed by Axum Task 19 routes."
            }

            if let Some(msg) = flash.read().clone() {
                p { class: "gs-flash", "{msg}" }
            }
            if let Some(err) = error.read().clone() {
                p { class: "gs-error", "{err}" }
            }

            div { class: "gs-card gs-admin-form",
                h2 { class: "gs-card-title", "Propose new version" }
                p { class: "gs-field-hint", "Version numbers are assigned by the server after governance approval." }
                div { class: "gs-form-row",
                    div { class: "gs-field gs-field--grow",
                        label { "Label" }
                        input {
                            value: "{new_label}",
                            placeholder: "e.g. Q2 tenant defaults",
                            oninput: move |e| new_label.set(e.value()),
                        }
                    }
                    button {
                        class: "gs-btn gs-btn--primary gs-btn--inline",
                        disabled: *creating.read(),
                        onclick: on_create,
                        if *creating.read() { "Creating…" } else { "Create" }
                    }
                }
            }

            if *loading.read() {
                p { class: "gs-hint", "Loading policy versions…" }
            } else if versions.read().is_empty() {
                p { class: "gs-hint", "No policy versions yet — create one above." }
            } else {
                div { class: "gs-table-wrap",
                    table { class: "gs-table",
                        thead {
                            tr {
                                th { "Version" }
                                th { "Label" }
                                th { "Rules" }
                                th { "Status" }
                                th { "Created" }
                                th { "" }
                            }
                        }
                        tbody {
                            for row in versions.read().iter().cloned() {
                                tr { key: "{row.id}",
                                    td { "v{row.version}" }
                                    td { "{row.label}" }
                                    td { "{row.policy_count}" }
                                    td {
                                        if row.is_active {
                                            span { class: "gs-badge gs-badge--active", "Active" }
                                        } else {
                                            span { class: "gs-badge gs-badge--draft", "Draft" }
                                        }
                                    }
                                    td { class: "gs-table-muted", "{row.created_at}" }
                                    td {
                                        Link {
                                            to: Route::PolicyDetail { id: row.id.clone() },
                                            class: "gs-btn gs-btn--ghost gs-btn--inline",
                                            "Open"
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
