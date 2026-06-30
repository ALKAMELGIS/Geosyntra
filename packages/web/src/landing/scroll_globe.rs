use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::{OnboardingContext, WizardOpenOptions, WizardStep, AuthMode},
};

use super::content::GLOBE_SECTIONS;

#[component]
pub fn LandingScrollGlobe() -> Element {
    let auth = AuthContext::use_auth();
    let onboarding = OnboardingContext::use_onboarding();

    rsx! {
        div { class: "gs-scroll-globe",
            for section in GLOBE_SECTIONS {
                section {
                    id: "{section.id}",
                    class: "gs-scroll-globe__panel",
                    div { class: "gs-scroll-globe__inner",
                        span { class: "gs-scroll-globe__badge", "{section.badge}" }
                        h2 { class: "gs-scroll-globe__title", "{section.title}" }
                        if let Some(sub) = section.subtitle {
                            h3 { class: "gs-scroll-globe__subtitle", "{sub}" }
                        }
                        p { class: "gs-scroll-globe__desc", "{section.description}" }
                        if section.has_actions {
                            div { class: "gs-scroll-globe__actions",
                                button {
                                    class: "gs-btn gs-btn--primary",
                                    onclick: move |_| {
                                        onboarding.open_wizard(
                                            &auth.session.read(),
                                            WizardOpenOptions {
                                                step: Some(WizardStep::Welcome),
                                                auth_mode: Some(AuthMode::Signup),
                                                ..Default::default()
                                            },
                                        );
                                    },
                                    "Join the Movement"
                                }
                                button {
                                    class: "gs-btn gs-btn--ghost",
                                    onclick: move |_| {
                                        crate::onboarding::scroll_to_hash("#innovation");
                                    },
                                    "Explore More"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
