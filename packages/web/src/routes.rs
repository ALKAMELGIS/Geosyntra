use dioxus::prelude::*;

pub use crate::components::admin::AdminShell;
pub use crate::pages::{
    AdminAudit, AdminGovernance, AdminGrants, AdminMemberships, AdminOverview, AdminPlatform,
    AdminRoles, AdminTeam, AdminTenants, AdminTokens, AdminUsers, Dashboard,
    JoinTeam, Landing, Login, PolicyDetail, PolicyList, Satellite, SatelliteIndices,
    SettingsApiIntegrations, SettingsOverview, SettingsProfile,
};

#[derive(Routable, Clone, PartialEq, Debug)]
pub enum Route {
    #[route("/")]
    Landing {},
    #[route("/dashboard")]
    Dashboard {},
    #[route("/login")]
    Login {},
    #[route("/join-team?:token")]
    JoinTeam { token: String },
    #[route("/satellite")]
    Satellite {},
    #[route("/satellite/indices")]
    SatelliteIndices {},
    #[route("/settings")]
    SettingsOverview {},
    #[route("/settings/profile")]
    SettingsProfile {},
    #[route("/settings/api-integrations")]
    SettingsApiIntegrations {},
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
}
