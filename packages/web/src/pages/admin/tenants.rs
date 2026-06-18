use dioxus::prelude::*;
use serde_json::{json, Value};

use crate::{
    api::admin::{bearer_token, tenants::{self, TenantRow}},
    auth_session::AuthContext,
    components::admin::{
        AdminDetailModal, AdminShell, AdminStepperModal, ConfigKeysEditor, TENANT_CONFIG_KEYS,
        forms::{TextAreaField, TextField},
    },
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn config_value_for_api(v: &Value) -> Option<Value> {
    if v.is_null() || v.as_object().is_some_and(|o| o.is_empty()) {
        None
    } else {
        Some(v.clone())
    }
}

fn tenant_detail_fields(row: &TenantRow, config: &Value) -> Vec<(String, String)> {
    let config_summary = TENANT_CONFIG_KEYS
        .iter()
        .map(|k| {
            let val = config
                .get(*k)
                .map(|v| v.to_string())
                .unwrap_or_else(|| "—".into());
            format!("{}: {}", k, val)
        })
        .collect::<Vec<_>>()
        .join(", ");
    vec![
        ("Id".into(), row.id.clone()),
        ("Name".into(), row.name.clone()),
        (
            "Description".into(),
            if row.description.is_empty() {
                "—".into()
            } else {
                row.description.clone()
            },
        ),
        (
            "Type".into(),
            if row.is_platform_tenant {
                "Platform".into()
            } else {
                "Customer".into()
            },
        ),
        (
            "Created".into(),
            row.created_at
                .map(|t| t.to_string())
                .unwrap_or_else(|| "—".into()),
        ),
        ("Config".into(), config_summary),
    ]
}

#[component]
pub fn AdminTenants() -> Element {
    let auth = AuthContext::use_auth();
    let mut rows = use_signal(Vec::<TenantRow>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut submitting = use_signal(|| false);

    let mut create_open = use_signal(|| false);
    let mut create_step = use_signal(|| 1_u32);
    let mut new_id = use_signal(String::new);
    let mut new_name = use_signal(String::new);
    let mut new_description = use_signal(String::new);
    let mut new_config = use_signal(|| json!({}));

    let mut edit_open = use_signal(|| false);
    let mut edit_step = use_signal(|| 1_u32);
    let mut edit_target = use_signal(|| None::<String>);
    let mut edit_name = use_signal(String::new);
    let mut edit_description = use_signal(String::new);
    let mut edit_config = use_signal(|| json!({}));

    let mut view_row = use_signal(|| None::<TenantRow>);

    let reload = move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match tenants::list_tenants(&token).await {
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
    };

    use_effect(move || {
        reload();
    });

    let mut reset_create = move || {
        create_open.set(false);
        create_step.set(1);
        new_id.set(String::new());
        new_name.set(String::new());
        new_description.set(String::new());
        new_config.set(json!({}));
    };

    let on_propose_create = move |_| {
        let id = new_id.read().trim().to_string();
        let name = new_name.read().trim().to_string();
        let desc = new_description.read().trim().to_string();
        let config = config_value_for_api(&*new_config.read());
        if id.is_empty() || name.is_empty() {
            error.set(Some("Tenant id and name are required".into()));
            return;
        }
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match tenants::propose_create(
                    &token,
                    &id,
                    &name,
                    if desc.is_empty() { None } else { Some(&desc) },
                    config.as_ref(),
                )
                .await
                {
                    Ok(resp) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Proposal {} submitted — {} approvals required",
                            resp.proposal_id, resp.required_approvals
                        )));
                        reset_create();
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

    let mut reset_edit = move || {
        edit_open.set(false);
        edit_step.set(1);
        edit_target.set(None);
        edit_name.set(String::new());
        edit_description.set(String::new());
        edit_config.set(json!({}));
    };

    let on_propose_update = move |_| {
        let Some(id) = edit_target.read().clone() else {
            return;
        };
        let name = edit_name.read().trim().to_string();
        let desc = edit_description.read().trim().to_string();
        let config = config_value_for_api(&*edit_config.read());
        if name.is_empty() {
            error.set(Some("Name is required".into()));
            return;
        }
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match tenants::propose_update(
                    &token,
                    &id,
                    &name,
                    if desc.is_empty() { None } else { Some(&desc) },
                    config.as_ref(),
                )
                .await
                {
                    Ok(resp) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Update proposal {} — {} approvals required",
                            resp.proposal_id, resp.required_approvals
                        )));
                        reset_edit();
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

    let mut open_edit = move |row: TenantRow| {
        edit_target.set(Some(row.id.clone()));
        edit_name.set(row.name.clone());
        edit_description.set(row.description.clone());
        edit_config.set(json!({}));
        edit_step.set(1);
        edit_open.set(true);
    };

    let view_fields = view_row
        .read()
        .as_ref()
        .map(|r| tenant_detail_fields(r, &json!({})))
        .unwrap_or_default();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Tenants" }
                p { class: "gs-page-lead",
                    "Platform tenant registry. New tenants and renames require governance approval (≥3 admins)."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                div { class: "gs-page-toolbar",
                    span { class: "gs-hint", "Tenant registry" }
                    button {
                        class: "gs-btn gs-btn--primary",
                        r#type: "button",
                        onclick: move |_| {
                            create_step.set(1);
                            create_open.set(true);
                        },
                        "Propose new tenant"
                    }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading tenants…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No tenants returned." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Id" }
                                    th { "Name" }
                                    th { "Type" }
                                    th { "Created" }
                                    th { "Actions" }
                                }
                            }
                            tbody {
                                for row in rows.read().iter().cloned() {
                                    {
                                        let row_id = row.id.clone();
                                        rsx! {
                                            tr { key: "{row_id}",
                                                td { code { "{row.id}" } }
                                                td { "{row.name}" }
                                                td {
                                                    if row.is_platform_tenant {
                                                        span { class: "gs-badge gs-badge--active", "Platform" }
                                                    } else {
                                                        span { class: "gs-badge gs-badge--draft", "Customer" }
                                                    }
                                                }
                                                td { class: "gs-table-muted",
                                                    "{row.created_at.map(|t| t.to_string()).unwrap_or_else(|| \"—\".into())}"
                                                }
                                                td { class: "gs-table-actions",
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        onclick: {
                                                            let row = row.clone();
                                                            move |_| view_row.set(Some(row.clone()))
                                                        },
                                                        "View"
                                                    }
                                                    if !row.is_platform_tenant {
                                                        button {
                                                            class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                            onclick: {
                                                                let row = row.clone();
                                                                move |_| open_edit(row.clone())
                                                            },
                                                            "Propose update"
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

                AdminDetailModal {
                    open: view_row.read().is_some(),
                    title: String::from("Tenant details"),
                    on_close: move |_| view_row.set(None),
                    fields: view_fields,
                }

                AdminStepperModal {
                    open: *create_open.read(),
                    title: String::from("Propose new tenant"),
                    step: *create_step.read(),
                    total_steps: 4,
                    submitting: *submitting.read(),
                    submit_label: String::from("Propose create"),
                    on_close: move |_| reset_create(),
                    on_back: move |_| create_step.set(create_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *create_step.read() == 1 {
                            let id = new_id.read().trim().to_string();
                            let name = new_name.read().trim().to_string();
                            if id.is_empty() || name.is_empty() {
                                error.set(Some("Tenant id and name are required".into()));
                                return;
                            }
                        }
                        create_step.set(create_step() + 1);
                    },
                    on_submit: on_propose_create,
                    if *create_step.read() == 1 {
                        div { class: "gs-form-row",
                            TextField {
                                label: String::from("Tenant id (slug)"),
                                value: new_id.read().clone(),
                                placeholder: String::from("acme-corp"),
                                on_input: move |e: FormEvent| new_id.set(e.value()),
                            }
                            TextField {
                                label: String::from("Display name"),
                                value: new_name.read().clone(),
                                placeholder: String::from("Acme Corporation"),
                                on_input: move |e: FormEvent| new_name.set(e.value()),
                            }
                        }
                    } else if *create_step.read() == 2 {
                        TextAreaField {
                            label: String::from("Description"),
                            value: new_description.read().clone(),
                            on_input: move |e: FormEvent| new_description.set(e.value()),
                        }
                    } else if *create_step.read() == 3 {
                        ConfigKeysEditor {
                            keys: TENANT_CONFIG_KEYS,
                            values: new_config.read().clone(),
                            on_change: move |v| new_config.set(v),
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Id" }
                                dd { class: "gs-detail-value", "{new_id}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Name" }
                                dd { class: "gs-detail-value", "{new_name}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Description" }
                                dd { class: "gs-detail-value",
                                    if new_description.read().is_empty() {
                                        "—"
                                    } else {
                                        "{new_description}"
                                    }
                                }
                            }
                        }
                    }
                }

                AdminStepperModal {
                    open: *edit_open.read(),
                    title: String::from("Propose tenant update"),
                    step: *edit_step.read(),
                    total_steps: 3,
                    submitting: *submitting.read(),
                    submit_label: String::from("Propose update"),
                    on_close: move |_| reset_edit(),
                    on_back: move |_| edit_step.set(edit_step().saturating_sub(1)),
                    on_next: move |_| {
                        if *edit_step.read() == 1 {
                            let name = edit_name.read().trim().to_string();
                            if name.is_empty() {
                                error.set(Some("Name is required".into()));
                                return;
                            }
                        }
                        edit_step.set(edit_step() + 1);
                    },
                    on_submit: on_propose_update,
                    if *edit_step.read() == 1 {
                        div { class: "gs-form-row",
                            TextField {
                                label: String::from("Display name"),
                                value: edit_name.read().clone(),
                                on_input: move |e: FormEvent| edit_name.set(e.value()),
                            }
                        }
                        TextAreaField {
                            label: String::from("Description"),
                            value: edit_description.read().clone(),
                            on_input: move |e: FormEvent| edit_description.set(e.value()),
                        }
                    } else if *edit_step.read() == 2 {
                        ConfigKeysEditor {
                            keys: TENANT_CONFIG_KEYS,
                            values: edit_config.read().clone(),
                            on_change: move |v| edit_config.set(v),
                        }
                    } else {
                        dl { class: "gs-detail-grid",
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Tenant id" }
                                dd { class: "gs-detail-value", "{edit_target.read().clone().unwrap_or_default()}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Name" }
                                dd { class: "gs-detail-value", "{edit_name}" }
                            }
                            div { class: "gs-detail-row",
                                dt { class: "gs-detail-label", "Description" }
                                dd { class: "gs-detail-value",
                                    if edit_description.read().is_empty() {
                                        "—"
                                    } else {
                                        "{edit_description}"
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
