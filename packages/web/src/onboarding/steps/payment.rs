use dioxus::prelude::*;

use crate::{
    api::billing,
    auth_session::AuthContext,
    onboarding::{get_pricing_plan, OnboardingContext, BillingPlanId, WizardStep},
    workspace::activate_paid_workspace,
};

#[component]
pub fn WizardPaymentStep() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let plan = *onboarding.selected_plan.read();
    let plan_meta = get_pricing_plan(plan);
    let mut local_error = use_signal(|| None::<String>);
    let mut busy = use_signal(|| false);

    rsx! {
        div { class: "gs-wizard-step gs-wizard-step--payment",
            h2 { class: "gs-wizard-step__title", "Activate {OnboardingContext::plan_label(plan)}" }
            if let Some(meta) = plan_meta {
                p { class: "gs-wizard-step__lede", "{meta.price_note}" }
            }
            if let Some(err) = local_error() {
                p { class: "gs-error", "{err}" }
            }
            p { class: "gs-hint",
                "Stripe Checkout opens when configured. Dev mode can activate without payment."
            }
            button {
                class: "gs-btn gs-btn--primary",
                disabled: busy(),
                onclick: move |_| {
                    let session = auth.session.read().clone();
                    let Some(token) = session.bearer().map(str::to_string) else {
                        onboarding.step.set(WizardStep::Welcome);
                        return;
                    };
                    busy.set(true);
                    local_error.set(None);
                    spawn(async move {
                        match billing::create_checkout_session(&token, plan).await {
                            Ok(url) => {
                                #[cfg(all(feature = "web", target_arch = "wasm32"))]
                                {
                                    if let Some(window) = web_sys::window() {
                                        let _ = window.location().set_href(&url);
                                    }
                                }
                                #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
                                {
                                    let _ = url;
                                }
                            }
                            Err(err) => {
                                busy.set(false);
                                local_error.set(Some(format!(
                                    "{} — use dev activate below.",
                                    err.user_message()
                                )));
                            }
                        }
                    });
                },
                "Pay with Stripe"
            }
            button {
                class: "gs-btn gs-btn--ghost",
                disabled: busy(),
                onclick: move |_| {
                    let session = auth.session.read().clone();
                    let Some(token) = session.bearer().map(str::to_string) else {
                        onboarding.step.set(WizardStep::Welcome);
                        return;
                    };
                    busy.set(true);
                    spawn(async move {
                        let result = if plan == BillingPlanId::Pro {
                            billing::confirm_payment(&token, plan).await
                        } else {
                            billing::activate_plan(&token, plan, true).await
                        };
                        busy.set(false);
                        match result {
                            Ok(()) => {
                                activate_paid_workspace(&session);
                                onboarding.refresh_workspace();
                                onboarding.step.set(WizardStep::Launch);
                            }
                            Err(err) => local_error.set(Some(err.user_message())),
                        }
                    });
                },
                "Dev: activate without Stripe"
            }
            button {
                class: "gs-btn gs-btn--ghost",
                onclick: move |_| onboarding.step.set(WizardStep::Pricing),
                "Back"
            }
        }
    }
}
