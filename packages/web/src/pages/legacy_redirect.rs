//! Legacy React URL compatibility — redirect bookmarks to Dioxus routes.

use dioxus::prelude::*;

use crate::{
    onboarding::{
        home_wizard_search, replace_location_search, AuthMode, BillingPlanId, WizardStep,
    },
    routes::Route,
};

#[component]
pub fn LegacyAccountProfile() -> Element {
    redirect(Route::SettingsProfile {})
}

#[component]
pub fn LegacySettingsAdmin() -> Element {
    redirect(Route::AdminOverview {})
}

#[component]
pub fn LegacySettingsAdminUsers() -> Element {
    redirect(Route::AdminUsers {})
}

#[component]
pub fn LegacySettingsAdminTeam() -> Element {
    redirect(Route::AdminTeam {})
}

#[component]
pub fn LegacySettingsAdminRoles() -> Element {
    redirect(Route::AdminRoles {})
}

#[component]
pub fn LegacySettingsAdminAudit() -> Element {
    redirect(Route::AdminAudit {})
}

#[component]
pub fn LegacySettingsAdminTokens() -> Element {
    redirect(Route::AdminTokens {})
}

#[component]
pub fn LegacyMasterGisContent() -> Element {
    redirect(Route::SettingsGisContent {})
}

#[component]
pub fn LegacyDataFertigation() -> Element {
    redirect(Route::FertigationRecords {})
}

#[component]
pub fn LegacyAuthRegister() -> Element {
    wizard_redirect(WizardStep::Welcome, AuthMode::Signup, false, None)
}

#[component]
pub fn LegacyBillingPricing() -> Element {
    wizard_redirect(WizardStep::Pricing, AuthMode::Signin, true, None)
}

#[component]
pub fn LegacyTrialStart() -> Element {
    wizard_redirect(
        WizardStep::Pricing,
        AuthMode::Signup,
        false,
        Some(BillingPlanId::Trial),
    )
}

fn redirect(target: Route) -> Element {
    let nav = use_navigator();
    let target = target.clone();
    use_effect(move || {
        let _ = nav.replace(target.clone());
    });
    rsx! {
        div { class: "gs-gis-loading", "Redirecting…" }
    }
}

fn wizard_redirect(
    wizard: WizardStep,
    auth_mode: AuthMode,
    upgrade: bool,
    plan_id: Option<BillingPlanId>,
) -> Element {
    let nav = use_navigator();
    use_effect(move || {
        let search = home_wizard_search(wizard, auth_mode, upgrade, plan_id);
        replace_location_search(&search);
        let _ = nav.replace(Route::Landing {});
    });
    rsx! {
        div { class: "gs-gis-loading", "Opening onboarding…" }
    }
}
