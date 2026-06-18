use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    landing::{
        LandingFooter, LandingHero, LandingNav, LandingPricing, LandingScrollGlobe,
    },
    onboarding::{
        parse_wizard_query, read_location_search, read_oauth_callback, scroll_to_hash_on_load,
        strip_oauth_from_location, OnboardingContext, OnboardingWizard,
    },
};

/// Public SaaS landing — Task 24 Phase B (nav, globe, wizard, pricing, status bar).
#[component]
pub fn Landing() -> Element {
    let auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();

    use_effect(move || {
        scroll_to_hash_on_load();
        let session = auth.session.read().clone();
        onboarding.apply_launch_from_url(&session);
        let search = read_location_search();
        let oauth = read_oauth_callback(&search);
        if oauth.code.is_some() {
            strip_oauth_from_location();
            onboarding.oauth_pending.set(true);
            onboarding.info.set(Some(
                "OAuth sign-in received — complete email/password sign-in or use API OAuth when configured.".into(),
            ));
            onboarding.open.set(true);
            onboarding.step.set(crate::onboarding::WizardStep::Welcome);
        }
        let params = parse_wizard_query(&search);
        if params.checkout_success {
            onboarding.info.set(Some("Payment confirmed — finishing workspace setup.".into()));
        }
    });

    rsx! {
        div { class: "gs-app gs-landing",
            LandingNav {}
            LandingHero {}
            LandingScrollGlobe {}
            LandingPricing {}
            LandingFooter {}
            OnboardingWizard {}
        }
    }
}
