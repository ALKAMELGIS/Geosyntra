use dioxus::prelude::*;
use serde_json::to_string_pretty;

use crate::{
    api::admin::{
        bearer_token,
        governance::{self, GovernanceProposal, REJECTION_REASONS},
    },
    auth_session::AuthContext,
    components::admin::{AdminNav, AdminShell},
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

fn now_secs() -> i64 {
    #[cfg(all(target_arch = "wasm32", feature = "web"))]
    {
        (js_sys::Date::now() / 1000.0) as i64
    }
    #[cfg(not(all(target_arch = "wasm32", feature = "web")))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    }
}

fn reviewable_hint(proposal: &GovernanceProposal) -> Option<String> {
    if proposal.status != "pending" {
        return None;
    }
    let remaining = proposal.reviewable_after - now_secs();
    if remaining <= 0 {
        return None;
    }
    let mins = (remaining + 59) / 60;
    Some(format!("Reviewable in ~{mins} min"))
}

fn can_approve(proposal: &GovernanceProposal, user_id: Option<&str>) -> bool {
    if proposal.status != "pending" {
        return false;
    }
    if now_secs() < proposal.reviewable_after {
        return false;
    }
    if user_id == Some(proposal.proposer_user_id.as_str()) {
        return false;
    }
    !user_id.is_some_and(|id| proposal.approver_ids.iter().any(|a| a == id))
}

#[component]
pub fn AdminGovernance() -> Element {
    rsx! {
        AdminShell {
            GovernanceInboxBody {}
        }
    }
}

#[component]
fn GovernanceInboxBody() -> Element {
    let auth = AuthContext::use_auth();
    let nav = AdminNav::use_nav();
    let mut rows = use_signal(Vec::<GovernanceProposal>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);
    let mut flash = use_signal(|| None::<String>);
    let mut selected = use_signal(|| None::<String>);
    let mut reject_reason = use_signal(|| REJECTION_REASONS[0].0.to_string());
    let mut reject_text = use_signal(String::new);
    let mut submitting = use_signal(|| false);

    let user_id = auth.session.read().user_id.clone();

    let on_approve = move |id: String| {
        let auth = auth.clone();
        let nav = nav;
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match governance::approve_proposal(&token, &id).await {
                    Ok(p) => {
                        submitting.set(false);
                        flash.set(Some(format!(
                            "Approval recorded ({}/{})",
                            p.approval_count, p.required_approvals
                        )));
                        selected.set(None);
                        loading.set(true);
                        if let Ok(list) = governance::list_proposals(&token, 100).await {
                            rows.set(list);
                            loading.set(false);
                        }
                        nav.refresh_badge.call(());
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

    let on_reject = move |id: String| {
        let auth = auth.clone();
        let nav = nav;
        let reason = reject_reason.read().clone();
        let text = reject_text.read().trim().to_string();
        let text_opt = if text.is_empty() { None } else { Some(text) };
        spawn(async move {
            submitting.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => {
                    match governance::reject_proposal(&token, &id, &reason, text_opt.as_deref())
                        .await
                    {
                        Ok(_) => {
                            submitting.set(false);
                            flash.set(Some(format!("Proposal {id} rejected")));
                            selected.set(None);
                            reject_text.set(String::new());
                            loading.set(true);
                            if let Ok(list) = governance::list_proposals(&token, 100).await {
                                rows.set(list);
                                loading.set(false);
                            }
                            nav.refresh_badge.call(());
                        }
                        Err(err) => {
                            submitting.set(false);
                            error.set(Some(display_api_error(&err)));
                        }
                    }
                }
                Err(err) => {
                    submitting.set(false);
                    error.set(Some(display_api_error(&err)));
                }
            }
        });
    };

    use_effect(move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match governance::list_proposals(&token, 100).await {
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
        div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Governance inbox" }
                p { class: "gs-page-lead",
                    "Pending platform and policy changes require ≥3 distinct admin approvals. "
                    "Proposers cannot approve their own proposals."
                }

                if let Some(msg) = flash.read().clone() {
                    p { class: "gs-flash", "{msg}" }
                }
                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading proposals…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No governance proposals yet." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Type" }
                                    th { "Summary" }
                                    th { "Tenant" }
                                    th { "Status" }
                                    th { "Approvals" }
                                    th { "Actions" }
                                }
                            }
                            tbody {
                                for row in rows.read().iter().cloned() {
                                    {
                                        let row_id = row.id.clone();
                                        let summary = governance::proposal_summary(&row);
                                        let status = row.status.clone();
                                        let approval_label = format!(
                                            "{}/{}",
                                            row.approval_count,
                                            row.required_approvals
                                        );
                                        let is_selected = selected.read().as_deref() == Some(row_id.as_str());
                                        let approve_ok = can_approve(&row, user_id.as_deref());
                                        let review_hint = reviewable_hint(&row);
                                        rsx! {
                                            tr { key: "{row_id}",
                                                td { code { "{row.proposal_type}" } }
                                                td { "{summary}" }
                                                td { code { "{row.tenant_id}" } }
                                                td {
                                                    span {
                                                        class: match status.as_str() {
                                                            "pending" => "gs-badge gs-badge--draft",
                                                            "approved" | "applied" => "gs-badge gs-badge--active",
                                                            _ => "gs-badge",
                                                        },
                                                        "{status}"
                                                    }
                                                }
                                                td { "{approval_label}" }
                                                td { class: "gs-table-actions",
                                                    button {
                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                        onclick: {
                                                            let row_id = row_id.clone();
                                                            move |_| {
                                                                if is_selected {
                                                                    selected.set(None);
                                                                } else {
                                                                    selected.set(Some(row_id.clone()));
                                                                }
                                                            }
                                                        },
                                                        if is_selected { "Hide" } else { "Review" }
                                                    }
                                                }
                                            }
                                            if is_selected {
                                                tr { key: "{row_id}-detail",
                                                    td { colspan: "6",
                                                        div { class: "gs-card gs-admin-form",
                                                            h3 { class: "gs-card-title", "Proposal {row_id}" }
                                                            p { class: "gs-hint",
                                                                "Proposer: {row.proposer_user_id}"
                                                            }
                                                            if let Some(hint) = review_hint {
                                                                p { class: "gs-hint", "{hint}" }
                                                            }
                                                            pre { class: "gs-code-block",
                                                                {
                                                                    to_string_pretty(&row.payload)
                                                                        .unwrap_or_else(|_| row.payload.to_string())
                                                                }
                                                            }
                                                            div { class: "gs-form-row",
                                                                if approve_ok {
                                                                    button {
                                                                        class: "gs-btn gs-btn--primary gs-btn--inline",
                                                                        disabled: *submitting.read(),
                                                                        onclick: {
                                                                            let row_id = row_id.clone();
                                                                            move |_| on_approve(row_id.clone())
                                                                        },
                                                                        "Approve"
                                                                    }
                                                                } else if row.status == "pending" {
                                                                    p { class: "gs-hint",
                                                                        if user_id.as_deref() == Some(row.proposer_user_id.as_str()) {
                                                                            "You proposed this change and cannot approve it."
                                                                        } else if now_secs() < row.reviewable_after {
                                                                            "Review window active — approval opens after the minimum wait."
                                                                        } else {
                                                                            "Already approved or not eligible."
                                                                        }
                                                                    }
                                                                }
                                                                div { class: "gs-field",
                                                                    label { r#for: "gs-gov-reject-reason", "Reject reason" }
                                                                    select {
                                                                        id: "gs-gov-reject-reason",
                                                                        class: "gs-input",
                                                                        value: "{reject_reason}",
                                                                        onchange: move |e: FormEvent| reject_reason.set(e.value()),
                                                                        for (code, label) in REJECTION_REASONS.iter() {
                                                                            option {
                                                                                key: "{code}",
                                                                                value: "{code}",
                                                                                "{label}"
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                                div { class: "gs-field gs-field--grow",
                                                                    label { r#for: "gs-gov-reject-text", "Notes (optional)" }
                                                                    input {
                                                                        id: "gs-gov-reject-text",
                                                                        value: "{reject_text}",
                                                                        oninput: move |e| reject_text.set(e.value()),
                                                                    }
                                                                }
                                                                if row.status == "pending" {
                                                                    button {
                                                                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                                                                        disabled: *submitting.read(),
                                                                        onclick: {
                                                                            let row_id = row_id.clone();
                                                                            move |_| on_reject(row_id.clone())
                                                                        },
                                                                        "Reject"
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
                }
        }
    }
}
