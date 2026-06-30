use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::OnboardingContext,
};

#[component]
pub fn WizardLaunchStep() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();
    let plan = OnboardingContext::plan_label(*onboarding.selected_plan.read());

    rsx! {
        div { class: "gs-wizard-step gs-wizard-step--launch",
            h2 { class: "gs-wizard-step__title", "You're ready" }
            p { class: "gs-wizard-step__lede",
                "Your {plan} workspace is active. Open the dashboard to explore satellite intelligence."
            }
            button {
                class: "gs-btn gs-btn--primary",
                onclick: move |_| {
                    let session = auth.session.read().clone();
                    if let Some(route) = onboarding.enter_workspace(&session) {
                        let _ = nav.push(route);
                    }
                },
                "Enter workspace"
            }
            button {
                class: "gs-btn gs-btn--ghost",
                onclick: move |_| onboarding.close_wizard(),
                "Stay on landing"
            }
        }
    }
}
