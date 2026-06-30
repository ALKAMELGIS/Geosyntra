use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    landing::{
        LandingFooter, LandingHero, LandingNav, LandingPricing, LandingScrollGlobe,
    },
    oauth_client::complete_oauth_with_code,
    onboarding::{
        parse_wizard_query, read_location_search, read_oauth_callback, scroll_to_hash_on_load,
        strip_oauth_from_location, OnboardingContext, OnboardingWizard, WizardStep,
    },
};

/// Public SaaS landing — Task 24 Phase B (nav, globe, wizard, pricing, status bar).
#[component]
pub fn Landing() -> Element {
    let mut auth = AuthContext::use_auth();
    let mut onboarding = OnboardingContext::use_onboarding();
    let nav = use_navigator();

    use_effect(move || {
        scroll_to_hash_on_load();
        let session = auth.session.read().clone();
        onboarding.apply_launch_from_url(&session);
        let search = read_location_search();
        let oauth = read_oauth_callback(&search);
        if let Some(code) = oauth.code.clone() {
            strip_oauth_from_location();
            let state = oauth.state.clone();
            onboarding.oauth_pending.set(true);
            onboarding.open.set(true);
            onboarding.step.set(WizardStep::Welcome);
            spawn(async move {
                auth.busy.set(true);
                auth.error.set(None);
                match complete_oauth_with_code(&code, state.as_deref(), true).await {
                    Ok(session) => {
                        auth.set_session(session.clone());
                        auth.busy.set(false);
                        onboarding.oauth_pending.set(false);
                        onboarding.info.set(None);
                        if let Some(route) = onboarding.handle_post_auth(&session) {
                            let _ = nav.replace(route);
                        }
                    }
                    Err(err) if err.is_empty() => {
                        auth.busy.set(false);
                        onboarding.oauth_pending.set(false);
                    }
                    Err(err) => {
                        auth.busy.set(false);
                        onboarding.oauth_pending.set(false);
                        auth.error.set(Some(err));
                    }
                }
            });
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
