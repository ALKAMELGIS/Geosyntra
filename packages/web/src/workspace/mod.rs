mod hero_access;
mod plan_route;
mod state;

pub use hero_access::{resolve_home_hero_access_mode, HomeHeroAccessMode};
pub use plan_route::{resolve_auth_plan_route, AuthPlanRoute};
pub use state::{
    activate_paid_workspace, activate_trial_workspace, ensure_platform_owner_workspace,
    is_platform_owner, is_trial_expired, read_workspace_state, requires_upgrade_to_paid,
    sync_trial_expiry, trial_days_remaining, write_workspace_state, WorkspaceLifecycle,
    WorkspaceState,
};

/// Main GIS workspace route — parity with React `HERO_PRIMARY_PATH` / `SAAS_ROUTES.dashboardDefault`.
pub fn default_workspace_route() -> crate::routes::Route {
    crate::routes::Route::SatelliteIndices {}
}
