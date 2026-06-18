use dioxus::prelude::*;

use crate::{
    api::admin::{
        bearer_token,
        policies::{self, PolicyRule, PolicyVersionDetail},
    },
    auth_session::AuthContext,
    components::admin::{AdminShell, AttrRowEditor},
    error_display::display_api_error,
    routes::Route,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

#[component]
pub fn PolicyDetail(id: String) -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();
    let policy_id = id.clone();
    let mut detail = use_signal(|| None::<PolicyVersionDetail>);
    let mut label = use_signal(String::new);
    let mut rules = use_signal(Vec::<PolicyRule>::new);
    let mut loading = use_signal(|| true);
    let mut saving = use_signal(|| false);
    let mut activating = use_signal(|| false);
    let mut confirm_activate = use_signal(|| false);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);

    let mut reload_tick = use_signal(|| 0_u32);

    let policy_id_for_fetch = policy_id.clone();
    use_effect(move || {
        let _ = *reload_tick.read();
        let policy_id = policy_id_for_fetch.clone();
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match policies::get_policy(&token, &policy_id).await {
                    Ok(view) => {
                        label.set(view.label.clone());
                        rules.set(view.policies.clone());
                        detail.set(Some(view));
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

    let on_save = {
        let policy_id = policy_id.clone();
        move |_| {
            let policy_id = policy_id.clone();
            let label_val = label.read().clone();
            let rules_val = rules.read().clone();
            spawn(async move {
                saving.set(true);
                error.set(None);
                match token_from(&auth) {
                    Ok(token) => {
                        match policies::update_policy(
                            &token,
                            &policy_id,
                            Some(&label_val),
                            Some(&rules_val),
                        )
                        .await
                        {
                            Ok(()) => {
                                saving.set(false);
                                flash.set(Some("Policy saved".into()));
                                reload_tick.set(reload_tick() + 1);
                            }
                            Err(err) => {
                                saving.set(false);
                                error.set(Some(display_api_error(&err)));
                            }
                        }
                    }
                    Err(err) => {
                        saving.set(false);
                        error.set(Some(display_api_error(&err)));
                    }
                }
            });
        }
    };

    let on_activate = {
        let policy_id = policy_id.clone();
        move |_| {
            let policy_id = policy_id.clone();
            spawn(async move {
                activating.set(true);
                error.set(None);
                match token_from(&auth) {
                    Ok(token) => match policies::activate_policy(&token, &policy_id).await {
                        Ok(()) => {
                            activating.set(false);
                            confirm_activate.set(false);
                            flash.set(Some("Policy activated — tenant reload applied".into()));
                            reload_tick.set(reload_tick() + 1);
                        }
                        Err(err) => {
                            activating.set(false);
                            error.set(Some(display_api_error(&err)));
                        }
                    },
                    Err(err) => {
                        activating.set(false);
                        error.set(Some(display_api_error(&err)));
                    }
                }
            });
        }
    };

    let on_delete = {
        let policy_id = policy_id.clone();
        move |_| {
            let policy_id = policy_id.clone();
            spawn(async move {
                match token_from(&auth) {
                    Ok(token) => match policies::delete_policy(&token, &policy_id).await {
                        Ok(true) => {
                            let _ = nav.replace(Route::PolicyList {});
                        }
                        Ok(false) => error.set(Some("Policy was not deleted".into())),
                        Err(err) => error.set(Some(display_api_error(&err))),
                    },
                    Err(err) => error.set(Some(display_api_error(&err))),
                }
            });
        }
    };

    let detail_snapshot = detail.read().clone();

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
            Link { to: Route::PolicyList {}, class: "gs-back-link", "← All policies" }

            if *loading.read() {
                p { class: "gs-hint", "Loading policy…" }
            } else if let Some(view) = detail_snapshot {
                h1 { class: "gs-page-title",
                    "Policy v{view.version}"
                    if view.is_active {
                        span { class: "gs-badge gs-badge--active", "Active" }
                    }
                }
                p { class: "gs-page-lead",
                    "Version {view.version} — rule ids are assigned by the server."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                div { class: "gs-card",
                    div { class: "gs-field",
                        label { "Label" }
                        input {
                            value: "{label}",
                            oninput: move |e| label.set(e.value()),
                        }
                    }

                    h2 { class: "gs-card-title", "Rules" }
                    div { class: "gs-table-wrap",
                        table { class: "gs-table gs-table--rules",
                            thead {
                                tr {
                                    th { "Resource" }
                                    th { "Action" }
                                    th { "Effect" }
                                    th { "Priority" }
                                    th { "Relations" }
                                    th { "Subject attrs" }
                                    th { "Resource attrs" }
                                    th { "" }
                                }
                            }
                            tbody {
                                for (idx, rule) in rules.read().iter().enumerate() {
                                    {
                                        let relations = rule.relations_text();
                                        rsx! {
                                    tr { key: "rule-{idx}",
                                        td {
                                            input {
                                                value: "{rule.resource_type}",
                                                oninput: move |e| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.resource_type = e.value();
                                                        }
                                                    });
                                                },
                                            }
                                        }
                                        td {
                                            input {
                                                value: "{rule.action}",
                                                oninput: move |e| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.action = e.value();
                                                        }
                                                    });
                                                },
                                            }
                                        }
                                        td {
                                            select {
                                                value: "{rule.effect}",
                                                onchange: move |e| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.effect = e.value();
                                                        }
                                                    });
                                                },
                                                option { value: "allow", "allow" }
                                                option { value: "deny", "deny" }
                                            }
                                        }
                                        td {
                                            input {
                                                r#type: "number",
                                                value: "{rule.priority}",
                                                oninput: move |e| {
                                                    if let Ok(p) = e.value().parse::<i32>() {
                                                        rules.with_mut(|rows| {
                                                            if let Some(r) = rows.get_mut(idx) {
                                                                r.priority = p;
                                                            }
                                                        });
                                                    }
                                                },
                                            }
                                        }
                                        td {
                                            input {
                                                value: "{relations}",
                                                placeholder: "member, owner",
                                                oninput: move |e| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.set_relations_text(&e.value());
                                                        }
                                                    });
                                                },
                                            }
                                        }
                                        td {
                                            AttrRowEditor {
                                                label: String::from("Subject attrs"),
                                                value: rule.required_subject_attributes.clone(),
                                                on_change: move |v| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.required_subject_attributes = v;
                                                        }
                                                    });
                                                },
                                            }
                                        }
                                        td {
                                            AttrRowEditor {
                                                label: String::from("Resource attrs"),
                                                value: rule.required_resource_attributes.clone(),
                                                on_change: move |v| {
                                                    rules.with_mut(|rows| {
                                                        if let Some(r) = rows.get_mut(idx) {
                                                            r.required_resource_attributes = v;
                                                        }
                                                    });
                                                },
                                            }
                                        }
                                        td {
                                            button {
                                                class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                onclick: move |_| {
                                                    rules.with_mut(|rows| {
                                                        rows.remove(idx);
                                                    });
                                                },
                                                "Remove"
                                            }
                                        }
                                    }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    button {
                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                        onclick: move |_| {
                            rules.with_mut(|rows| {
                                rows.push(PolicyRule::new_draft("resource", "action"));
                            });
                        },
                        "+ Add rule"
                    }

                    div { class: "gs-admin-actions",
                        button {
                            class: "gs-btn gs-btn--primary gs-btn--inline",
                            disabled: *saving.read(),
                            onclick: on_save,
                            if *saving.read() { "Saving…" } else { "Save changes" }
                        }
                        if !view.is_active {
                            if *confirm_activate.read() {
                                button {
                                    class: "gs-btn gs-btn--primary gs-btn--inline",
                                    disabled: *activating.read(),
                                    onclick: on_activate,
                                    if *activating.read() { "Activating…" } else { "Confirm activate" }
                                }
                                button {
                                    class: "gs-btn gs-btn--ghost gs-btn--inline",
                                    onclick: move |_| confirm_activate.set(false),
                                    "Cancel"
                                }
                            } else {
                                button {
                                    class: "gs-btn gs-btn--ghost gs-btn--inline",
                                    onclick: move |_| confirm_activate.set(true),
                                    "Activate version"
                                }
                            }
                        }
                        if !view.is_active {
                            button {
                                class: "gs-btn gs-btn--danger gs-btn--inline",
                                onclick: on_delete,
                                "Delete draft"
                            }
                        }
                    }
                }
            }
            }
        }
    }
}
