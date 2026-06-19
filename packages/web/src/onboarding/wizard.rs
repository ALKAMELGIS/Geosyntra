use dioxus::prelude::*;

use crate::onboarding::{
    steps::{WizardLaunchStep, WizardPaymentStep, WizardPricingStep, WizardWelcomeStep},
    OnboardingContext, WizardStep,
};

#[component]
pub fn OnboardingWizard() -> Element {
    let mut onboarding = OnboardingContext::use_onboarding();
    if !*onboarding.open.read() {
        return rsx! {};
    }

    let step = *onboarding.step.read();
    let panel_class = if step == WizardStep::Welcome {
        "gs-wizard-overlay__panel gs-wizard-overlay__panel--welcome"
    } else {
        "gs-wizard-overlay__panel"
    };
    let body = match step {
        WizardStep::Welcome => rsx! { WizardWelcomeStep {} },
        WizardStep::Pricing => rsx! { WizardPricingStep {} },
        WizardStep::Payment => rsx! { WizardPaymentStep {} },
        WizardStep::Activation => rsx! {
            div { class: "gs-wizard-step gs-wizard-step--activation",
                h2 { "Activating workspace…" }
                p { class: "gs-hint", "Setting up trial access and permissions." }
            }
        },
        WizardStep::Launch => rsx! { WizardLaunchStep {} },
    };

    rsx! {
        div {
            class: "gs-wizard-overlay",
            role: "dialog",
            aria_modal: "true",
            aria_label: "GeoSyntra onboarding",
            div {
                class: "gs-wizard-overlay__backdrop",
                onclick: move |_| onboarding.close_wizard(),
            }
            div { class: "{panel_class}",
                if let Some(info) = onboarding.info.read().clone() {
                    p { class: "gs-wizard-overlay__info", "{info}" }
                }
                {body}
            }
        }
    }
}
