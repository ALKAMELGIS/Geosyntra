use dioxus::prelude::*;

pub use crate::components::admin::AdminShell;
pub use crate::pages::{
    AdminAudit, AdminBilling, AdminGitHub, AdminGovernance, AdminGrants, AdminMemberships,
    AdminOverview, AdminPlatform, AdminRoles, AdminTeam, AdminTenants, AdminTokens, AdminUsers,
    Dashboard, DynamicBindPage, FertigationRecords, JoinTeam, Landing, LearnMore, Login,
    Multidimensional, PolicyDetail, PolicyList, Recipes, ResetPassword, Satellite, SatelliteIndices,
    SettingsApiIntegrations, SettingsGisContent, SettingsGisContentItem, SettingsOverview,
    SettingsProfile, VerifyEmail, LegacyAccountProfile, LegacyAuthRegister, LegacyBillingPricing,
    LegacyDataFertigation, LegacyMasterGisContent, LegacySettingsAdmin, LegacySettingsAdminAudit,
    LegacySettingsAdminRoles, LegacySettingsAdminTeam, LegacySettingsAdminTokens,
    LegacySettingsAdminUsers, LegacyTrialStart,
};

#[component]
fn AppAuthLogin() -> Element {
    rsx! { Login {} }
}

#[derive(Routable, Clone, PartialEq, Debug)]
pub enum Route {
    #[route("/")]
    Landing {},
    #[route("/learn-more")]
    LearnMore {},
    #[route("/dashboard")]
    Dashboard {},
    #[route("/login")]
    Login {},
    #[route("/app/auth/login")]
    AppAuthLogin {},
    #[route("/app/auth/register")]
    LegacyAuthRegister {},
    #[route("/app/auth/verify-email?:token")]
    VerifyEmail { token: Option<String> },
    #[route("/app/auth/reset-password?:token")]
    ResetPassword { token: Option<String> },
    #[route("/app/billing/pricing")]
    LegacyBillingPricing {},
    #[route("/app/onboarding/trial-start")]
    LegacyTrialStart {},
    #[route("/join-team?:token")]
    JoinTeam { token: String },
    #[route("/account/profile")]
    LegacyAccountProfile {},
    #[route("/satellite")]
    Satellite {},
    #[route("/satellite/indices")]
    SatelliteIndices {},
    #[route("/satellite/multidimensional")]
    Multidimensional {},
    #[route("/data/fertigation-records")]
    FertigationRecords {},
    #[route("/data/fertigation")]
    LegacyDataFertigation {},
    #[route("/data/recipes/:form_slug")]
    Recipes { form_slug: String },
    #[route("/pages/:bind_target?:title")]
    DynamicBindPage { bind_target: String, title: Option<String> },
    #[route("/settings")]
    SettingsOverview {},
    #[route("/settings/profile")]
    SettingsProfile {},
    #[route("/settings/api-integrations")]
    SettingsApiIntegrations {},
    #[route("/settings/gis-content")]
    SettingsGisContent {},
    #[route("/settings/gis-content/item/:item_id")]
    SettingsGisContentItem { item_id: String },
    #[route("/master/gis-content")]
    LegacyMasterGisContent {},
    #[route("/settings/admin")]
    LegacySettingsAdmin {},
    #[route("/settings/admin/users")]
    LegacySettingsAdminUsers {},
    #[route("/settings/admin/team")]
    LegacySettingsAdminTeam {},
    #[route("/settings/admin/roles")]
    LegacySettingsAdminRoles {},
    #[route("/settings/admin/audit")]
    LegacySettingsAdminAudit {},
    #[route("/settings/admin/tokens")]
    LegacySettingsAdminTokens {},
    #[route("/admin")]
    AdminOverview {},
    #[route("/admin/policies")]
    PolicyList {},
    #[route("/admin/policies/:id")]
    PolicyDetail { id: String },
    #[route("/admin/users")]
    AdminUsers {},
    #[route("/admin/team")]
    AdminTeam {},
    #[route("/admin/roles")]
    AdminRoles {},
    #[route("/admin/audit")]
    AdminAudit {},
    #[route("/admin/governance")]
    AdminGovernance {},
    #[route("/admin/tenants")]
    AdminTenants {},
    #[route("/admin/memberships")]
    AdminMemberships {},
    #[route("/admin/grants")]
    AdminGrants {},
    #[route("/admin/platform")]
    AdminPlatform {},
    #[route("/admin/tokens")]
    AdminTokens {},
    #[route("/admin/billing")]
    AdminBilling {},
    #[route("/admin/github")]
    AdminGitHub {},
}
