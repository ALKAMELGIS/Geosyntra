use dioxus::prelude::*;

use crate::{
    api::{
        admin::{bearer_token, users::list_users},
        billing::{fetch_billing_me, fetch_billing_plans},
    },
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
    routes::Route,
};

#[component]
pub fn AdminOverview() -> Element {
    let auth = AuthContext::use_auth();
    let session = auth.session.read().clone();
    let mut user_count = use_signal(|| 0usize);
    let mut active_count = use_signal(|| 0usize);
    let mut pending_count = use_signal(|| 0usize);
    let mut plan_label = use_signal(|| "—".to_string());
    let mut plan_status = use_signal(|| "—".to_string());
    let mut plan_count = use_signal(|| 0usize);
    let mut stats_error = use_signal(|| None::<String>);

    use_effect({
        let session = session.clone();
        move || {
            let token = match bearer_token(&session) {
                Ok(t) => t,
                Err(err) => {
                    stats_error.set(Some(display_api_error(&err)));
                    return;
                }
            };
            spawn(async move {
                stats_error.set(None);
                if let Ok(users) = list_users(&token).await {
                    user_count.set(users.len());
                    active_count.set(
                        users
                            .iter()
                            .filter(|u| {
                                u.status
                                    .as_deref()
                                    .is_some_and(|s| s.eq_ignore_ascii_case("active"))
                            })
                            .count(),
                    );
                    pending_count.set(
                        users
                            .iter()
                            .filter(|u| {
                                u.status.as_deref().is_some_and(|s| {
                                    s.contains("Pending") || s.eq_ignore_ascii_case("pending approval")
                                })
                            })
                            .count(),
                    );
                }
                if let Ok(plans) = fetch_billing_plans().await {
                    plan_count.set(plans.len());
                }
                if let Ok(me) = fetch_billing_me(&token).await {
                    plan_label.set(
                        me.subscription
                            .plan
                            .unwrap_or_else(|| "trial".into()),
                    );
                    plan_status.set(
                        me.subscription
                            .status
                            .unwrap_or_else(|| "unknown".into()),
                    );
                }
            });
        }
    });

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Admin overview" }
                p { class: "gs-page-lead",
                    "Platform health, user directory, and billing snapshot."
                }

                if let Some(err) = stats_error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                div { class: "gs-admin-stats",
                    div { class: "gs-stat-card",
                        span { class: "gs-stat-label", "Users" }
                        strong { class: "gs-stat-value", "{user_count}" }
                    }
                    div { class: "gs-stat-card",
                        span { class: "gs-stat-label", "Active" }
                        strong { class: "gs-stat-value", "{active_count}" }
                    }
                    div { class: "gs-stat-card",
                        span { class: "gs-stat-label", "Pending" }
                        strong { class: "gs-stat-value", "{pending_count}" }
                    }
                    div { class: "gs-stat-card",
                        span { class: "gs-stat-label", "Your plan" }
                        strong { class: "gs-stat-value", "{plan_label}" }
                        span { class: "gs-hint", "{plan_status}" }
                    }
                    div { class: "gs-stat-card",
                        span { class: "gs-stat-label", "Billing plans" }
                        strong { class: "gs-stat-value", "{plan_count}" }
                    }
                }

                div { class: "gs-admin-grid",
                    Link { to: Route::AdminGovernance {}, class: "gs-admin-tile",
                        h2 { "Governance inbox" }
                        p { "Review and approve platform changes requiring multi-admin quorum." }
                    }
                    Link { to: Route::PolicyList {}, class: "gs-admin-tile",
                        h2 { "Policy versions" }
                        p { "Create, edit ABAC rules, and activate tenant policy versions." }
                    }
                    Link { to: Route::AdminUsers {}, class: "gs-admin-tile",
                        h2 { "Users" }
                        p { "Approve pending accounts, suspend, or reactivate users." }
                    }
                    Link { to: Route::AdminTeam {}, class: "gs-admin-tile",
                        h2 { "Team & invites" }
                        p { "Send role invites and approve pending signups." }
                    }
                    Link { to: Route::AdminRoles {}, class: "gs-admin-tile",
                        h2 { "Roles & permissions" }
                        p { "View the server-enforced RBAC permission matrix." }
                    }
                    Link { to: Route::AdminAudit {}, class: "gs-admin-tile",
                        h2 { "Audit log" }
                        p { "Recent security and administration events." }
                    }
                    Link { to: Route::AdminBilling {}, class: "gs-admin-tile",
                        h2 { "Billing" }
                        p { "Subscription plans and tenant billing status." }
                    }
                    Link { to: Route::AdminGitHub {}, class: "gs-admin-tile",
                        h2 { "GitHub integration" }
                        p { "Connect repos, browse issues, and create tickets." }
                    }
                    Link { to: Route::AdminTokens {}, class: "gs-admin-tile",
                        h2 { "System tokens" }
                        p { "Owner-only registry status for platform API credentials." }
                    }
                }
            }
        }
    }
}
