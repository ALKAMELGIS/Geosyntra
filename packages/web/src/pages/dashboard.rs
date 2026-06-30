use dioxus::prelude::*;

use crate::{
    auth_session::{AuthContext, AuthSession},
    components::{layout::AppLayout, AppNavSection},
    routes::Route,
};

/// Signed-in operational hub (Task 24.1 — was `/`).
#[component]
pub fn Dashboard() -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();

    let session = use_memo(move || {
        let cached = auth.session.read().clone();
        if cached.is_signed_in() {
            cached
        } else {
            AuthSession::read_local()
        }
    });

    use_effect(move || {
        let local = AuthSession::read_local();
        if local.is_signed_in() && !auth.session.read().is_signed_in() {
            auth.set_session(local);
        }
    });

    use_effect(move || {
        let snap = auth.session.read().clone();
        if !snap.is_signed_in() {
            let _ = nav.replace(Route::Login {});
        } else if snap.permissions.is_empty() {
            return;
        } else if !snap.can_access_app() {
            let _ = nav.replace(Route::Landing {});
        }
    });

    if !session().can_access_app() {
        let local = AuthSession::read_local();
        let pending = local.is_signed_in()
            && (!session().is_signed_in() || session().permissions.is_empty());
        return rsx! {
            div { class: "gs-app gs-main",
                p { class: "gs-hint",
                    if pending {
                        "Loading dashboard…"
                    } else {
                        "Sign in to open your dashboard."
                    }
                }
            }
        };
    }

    let session = session();
    let tenant = session.active_tenant().to_string();
    let lead = format!("GeoSyntra operational hub — workspace for {tenant}.");
    rsx! {
        AppLayout {
            active: AppNavSection::Dashboard,
            title: "Dashboard".to_string(),
            lead,
            div { class: "gs-card",
                p { class: "gs-page-lead",
                    "Welcome, {session.display_name()}."
                }
                p { class: "gs-hint",
                    "Role: {session.role.clone().unwrap_or_else(|| \"—\".into())} · "
                    "Tenant: {session.active_tenant()} · "
                    "Email: {session.email.clone().unwrap_or_else(|| \"—\".into())}"
                }
                button {
                    class: "gs-btn gs-btn--ghost",
                    onclick: move |_| auth.sign_out(),
                    "Sign out"
                }
            }

            div { class: "gs-dashboard-grid",
                Link { to: Route::SatelliteIndices {}, class: "gs-admin-tile",
                    h2 { "GeoAI workspace" }
                    p { "Satellite intelligence and native GeoAI map workspace." }
                }
                Link { to: Route::SettingsOverview {}, class: "gs-admin-tile",
                    h2 { "Settings" }
                    p { "Profile and API integration status." }
                }
                if session.can_access_admin() {
                    Link { to: Route::AdminOverview {}, class: "gs-admin-tile",
                        h2 { "Admin console" }
                        p { "Policies, users, RBAC, and system tokens." }
                    }
                }
            }
        }
    }
}
