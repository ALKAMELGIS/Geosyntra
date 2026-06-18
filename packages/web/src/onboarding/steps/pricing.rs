use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::{
        get_pricing_plan, plan_requires_paid_checkout, BillingPlanId, OnboardingContext,
        WizardStep,
    },
};

#[component]
pub fn WizardPricingStep() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let plan = *onboarding.selected_plan.read();
    let plan_meta = get_pricing_plan(plan);

    rsx! {
        div { class: "gs-wizard-step gs-wizard-step--pricing",
            h2 { class: "gs-wizard-step__title", "Choose your plan" }
            if let Some(meta) = plan_meta {
                article { class: "gs-pricing-card gs-pricing-card--selected",
                    h3 { "{meta.name}" }
                    p { class: "gs-pricing-card__price", "{meta.price_label}" }
                    p { "{meta.description}" }
                }
            }
            div { class: "gs-wizard-step__plan-picks",
                for p in [BillingPlanId::Trial, BillingPlanId::Pro, BillingPlanId::Enterprise] {
                    button {
                        class: if plan == p { "gs-btn gs-btn--primary" } else { "gs-btn gs-btn--ghost" },
                        onclick: move |_| onboarding.selected_plan.set(p),
                        "{OnboardingContext::plan_label(p)}"
                    }
                }
            }
            button {
                class: "gs-btn gs-btn--primary",
                onclick: move |_| {
                    if plan_requires_paid_checkout(plan) {
                        onboarding.step.set(WizardStep::Payment);
                    } else {
                        onboarding.run_activation(auth);
                    }
                },
                if plan == BillingPlanId::Trial { "Start free trial" } else { "Continue to checkout" }
            }
            button {
                class: "gs-btn gs-btn--ghost",
                onclick: move |_| onboarding.step.set(WizardStep::Welcome),
                "Back"
            }
        }
    }
}
