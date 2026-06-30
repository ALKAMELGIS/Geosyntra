use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::{
        get_pricing_plan, plan_requires_paid_checkout, enterprise_sales_mailto,
        OnboardingContext, BillingPlanId, WizardOpenOptions, WizardStep, AuthMode,
    },
};

use super::content::GET_STARTED_LABEL;

#[component]
pub fn LandingPricing() -> Element {
    let auth = AuthContext::use_auth();
    let onboarding = OnboardingContext::use_onboarding();
    let selected = *onboarding.selected_plan.read();

    rsx! {
        section { id: "pricing", class: "gs-landing-pricing",
            div { class: "gs-landing-pricing__inner",
                h2 { class: "gs-landing-pricing__title", "Plans built for spatial teams" }
                p { class: "gs-landing-pricing__lede",
                    "Start with a 21-day free trial or activate Pro for 3 months with plan credits — Enterprise goes through sales."
                }
                div { class: "gs-landing-pricing__cards",
                    for plan in crate::onboarding::PRICING_PLANS {
                        {
                            let plan_id = plan.id;
                            let highlighted = plan.highlighted;
                            let is_selected = selected == plan_id;
                            rsx! {
                                article {
                                    class: if highlighted {
                                        "gs-pricing-card gs-pricing-card--highlight"
                                    } else if is_selected {
                                        "gs-pricing-card gs-pricing-card--selected"
                                    } else {
                                        "gs-pricing-card"
                                    },
                                    h3 { class: "gs-pricing-card__name", "{plan.name}" }
                                    p { class: "gs-pricing-card__price", "{plan.price_label}" }
                                    p { class: "gs-pricing-card__note", "{plan.price_note}" }
                                    p { class: "gs-pricing-card__desc", "{plan.description}" }
                                    ul { class: "gs-pricing-card__features",
                                        for feature in plan.features {
                                            li { "{feature}" }
                                        }
                                    }
                                    div { class: "gs-pricing-card__actions",
                                        button {
                                            class: "gs-btn gs-btn--ghost gs-pricing-card__select",
                                            onclick: move |_| onboarding.select_plan(plan_id),
                                            "Select"
                                        }
                                        button {
                                            class: "gs-btn gs-btn--primary",
                                            onclick: move |_| {
                                                let session = auth.session.read().clone();
                                                if plan_id == BillingPlanId::Enterprise {
                                                    #[cfg(all(feature = "web", target_arch = "wasm32"))]
                                                    {
                                                        let mailto = enterprise_sales_mailto(session.email.as_deref());
                                                        if let Some(window) = web_sys::window() {
                                                            let _ = window.location().set_href(&mailto);
                                                        }
                                                    }
                                                    return;
                                                }
                                                onboarding.select_plan(plan_id);
                                                if !session.is_signed_in() {
                                                    onboarding.open_wizard(
                                                        &session,
                                                        WizardOpenOptions {
                                                            step: Some(WizardStep::Welcome),
                                                            plan_id: Some(plan_id),
                                                            auth_mode: Some(AuthMode::Signup),
                                                            ..Default::default()
                                                        },
                                                    );
                                                    return;
                                                }
                                                if plan_requires_paid_checkout(plan_id) {
                                                    onboarding.open_wizard(
                                                        &session,
                                                        WizardOpenOptions {
                                                            step: Some(WizardStep::Payment),
                                                            plan_id: Some(plan_id),
                                                            auth_mode: Some(AuthMode::Signin),
                                                            ..Default::default()
                                                        },
                                                    );
                                                } else {
                                                    onboarding.open_wizard(
                                                        &session,
                                                        WizardOpenOptions {
                                                            step: Some(WizardStep::Pricing),
                                                            plan_id: Some(plan_id),
                                                            auth_mode: Some(AuthMode::Signin),
                                                            ..Default::default()
                                                        },
                                                    );
                                                    onboarding.run_activation(auth);
                                                }
                                            },
                                            "{plan.cta}"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                p { class: "gs-hint gs-landing-pricing__hint",
                    "{GET_STARTED_LABEL} — no credit card required for trial."
                }
            }
        }
    }
}
