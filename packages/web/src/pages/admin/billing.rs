use dioxus::prelude::*;

use crate::{
    api::{
        admin::bearer_token,
        billing::{fetch_billing_me, fetch_billing_plans, BillingPlan},
    },
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
};

#[component]
pub fn AdminBilling() -> Element {
    let auth = AuthContext::use_auth();
    let session = auth.session.read().clone();
    let mut plans = use_signal(Vec::<BillingPlan>::new);
    let mut plan_label = use_signal(|| "—".to_string());
    let mut plan_status = use_signal(|| "—".to_string());
    let mut trial_ends = use_signal(|| "—".to_string());
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    use_effect({
        let session = session.clone();
        move || {
            let token = match bearer_token(&session) {
                Ok(t) => t,
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                    return;
                }
            };
            spawn(async move {
                loading.set(true);
                error.set(None);
                if let Ok(list) = fetch_billing_plans().await {
                    plans.set(list);
                }
                match fetch_billing_me(&token).await {
                    Ok(me) => {
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
                        trial_ends.set(
                            me.subscription
                                .trial_ends_at
                                .unwrap_or_else(|| "—".into()),
                        );
                        loading.set(false);
                    }
                    Err(err) => {
                        error.set(Some(display_api_error(&err)));
                        loading.set(false);
                    }
                }
            });
        }
    });

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Billing" }
                p { class: "gs-page-lead",
                    "Tenant subscription and available platform plans."
                }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading billing data…" }
                } else {
                    div { class: "gs-card",
                        h2 { class: "gs-card-title", "Current subscription" }
                        dl { class: "gs-dl",
                            dt { "Plan" }
                            dd { "{plan_label}" }
                            dt { "Status" }
                            dd { "{plan_status}" }
                            dt { "Trial ends" }
                            dd { "{trial_ends}" }
                            dt { "Tenant" }
                            dd { code { "{session.active_tenant()}" } }
                        }
                    }

                    div { class: "gs-card",
                        h2 { class: "gs-card-title", "Available plans" }
                        if plans.read().is_empty() {
                            p { class: "gs-hint", "No plans returned from API." }
                        } else {
                            ul { class: "gs-list",
                                for plan in plans.read().iter().cloned() {
                                    li { key: "{plan.id}",
                                        code { "{plan.id}" }
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
