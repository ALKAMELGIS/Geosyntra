use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    onboarding::{OnboardingContext, AuthMode, WizardOpenOptions, WizardStep},
    workspace::{resolve_home_hero_access_mode, HomeHeroAccessMode},
};

use super::content::{GET_STARTED_LABEL, HERO, HERO_START_LABEL, HERO_TRIAL_LABEL};

#[component]
pub fn LandingHero() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let session = auth.session.read().clone();
    let hero_mode = resolve_home_hero_access_mode(&session);
    let cta_label = match hero_mode {
        HomeHeroAccessMode::Start => HERO_START_LABEL,
        HomeHeroAccessMode::Trial => HERO_TRIAL_LABEL,
    };

    let nav = use_navigator();

    let start_building = move |_| {
        let session = auth.session.read().clone();
        if session.is_signed_in() && hero_mode == HomeHeroAccessMode::Start {
            if let Some(route) = onboarding.enter_workspace(&session) {
                let _ = nav.push(route);
            }
        } else {
            onboarding.open_wizard(
                &session,
                WizardOpenOptions {
                    step: Some(if session.is_signed_in() {
                        WizardStep::Pricing
                    } else {
                        WizardStep::Welcome
                    }),
                    auth_mode: Some(if session.is_signed_in() {
                        AuthMode::Signin
                    } else {
                        AuthMode::Signup
                    }),
                    ..Default::default()
                },
            );
        }
    };

    rsx! {
        section { id: "start", class: "gs-landing-hero",
            h1 { class: "gs-landing-hero__title",
                span { class: "gs-landing-hero__line", "{HERO.line_before}" }
                span { class: "gs-landing-hero__accent",
                    span { class: "gs-landing-hero__accent-word", "{HERO.accent_highlight}" }
                    "{HERO.accent_remainder}"
                }
            }
            p { class: "gs-landing-hero__brand", "{HERO.globe_brand}" }
            p { class: "gs-page-lead gs-landing-hero__subtitle", "{HERO.subtitle}" }
            div { class: "gs-landing-hero__actions",
                button {
                    class: "gs-btn gs-btn--primary",
                    onclick: start_building,
                    "{cta_label}"
                }
                button {
                    class: "gs-btn gs-btn--ghost",
                    onclick: start_building,
                    "{GET_STARTED_LABEL}"
                }
            }
        }
    }
}
