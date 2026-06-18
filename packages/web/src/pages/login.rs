use dioxus::prelude::*;

use crate::{
    auth_api,
    auth_session::AuthContext,
    post_login,
    routes::Route,
};

#[cfg(all(target_arch = "wasm32", feature = "web"))]
fn post_login_path(route: &Route) -> Option<String> {
    Some(match route {
        Route::Landing {} => "/".into(),
        Route::Dashboard {} => "/dashboard".into(),
        Route::Login {} => "/login".into(),
        Route::JoinTeam { token } => format!("/join-team?token={token}"),
        Route::Satellite {} => "/satellite".into(),
        Route::SatelliteIndices {} => "/satellite/indices".into(),
        Route::SettingsOverview {} => "/settings".into(),
        Route::SettingsProfile {} => "/settings/profile".into(),
        Route::SettingsApiIntegrations {} => "/settings/api-integrations".into(),
        Route::AdminOverview {} => "/admin".into(),
        Route::PolicyList {} => "/admin/policies".into(),
        Route::PolicyDetail { id } => format!("/admin/policies/{id}"),
        Route::AdminUsers {} => "/admin/users".into(),
        Route::AdminTeam {} => "/admin/team".into(),
        Route::AdminRoles {} => "/admin/roles".into(),
        Route::AdminAudit {} => "/admin/audit".into(),
        Route::AdminGovernance {} => "/admin/governance".into(),
        Route::AdminTenants {} => "/admin/tenants".into(),
        Route::AdminMemberships {} => "/admin/memberships".into(),
        Route::AdminGrants {} => "/admin/grants".into(),
        Route::AdminPlatform {} => "/admin/platform".into(),
        Route::AdminTokens {} => "/admin/tokens".into(),
    })
}

macro_rules! navigate_after_login {
    ($nav:expr, $route:expr) => {{
        #[cfg(all(target_arch = "wasm32", feature = "web"))]
        {
            if let Some(path) = post_login_path(&$route) {
                if let Some(window) = web_sys::window() {
                    let _ = window.location().assign(&path);
                } else {
                    $nav.replace($route);
                }
            } else {
                $nav.replace($route);
            }
        }
        #[cfg(not(all(target_arch = "wasm32", feature = "web")))]
        {
            $nav.replace($route);
        }
    }};
}

#[component]
pub fn Login() -> Element {
    let mut auth = AuthContext::use_auth();
    let nav = use_navigator();
    let mut email = use_signal(String::new);
    let mut password = use_signal(String::new);

    use_effect(move || {
        if auth.session.read().is_signed_in() {
            let session = auth.session.read().clone();
            spawn(async move {
                let route = post_login::resolve_post_login_route(&session).await;
                navigate_after_login!(nav, route);
            });
        }
    });

    let on_submit = move |_| {
        let email_val = email.read().clone();
        let password_val = password.read().clone();
        spawn(async move {
            auth.busy.set(true);
            auth.error.set(None);
            match auth_api::login(&email_val, &password_val).await {
                Ok(session) => {
                    auth.set_session(session.clone());
                    auth.busy.set(false);
                    let route = post_login::resolve_post_login_route(&session).await;
                    navigate_after_login!(nav, route);
                }
                Err(err) => {
                    auth.busy.set(false);
                    auth.error
                        .set(Some(crate::auth_session::describe_session_error(&err)));
                }
            }
        });
    };

    rsx! {
        div { class: "gs-app gs-auth",
            div { class: "gs-auth-card",
                Link { to: Route::Landing {}, class: "gs-back-link", "← Back to home" }
                h1 { class: "gs-page-title", "Sign in" }
                p { class: "gs-page-lead",
                    "Access your GeoSyntra workspace."
                }
                if let Some(err) = auth.error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }
                div { class: "gs-field",
                    label { r#for: "email", "Email" }
                    input {
                        id: "email",
                        r#type: "email",
                        value: "{email}",
                        oninput: move |e| email.set(e.value()),
                        autocomplete: "email",
                    }
                }
                div { class: "gs-field",
                    label { r#for: "password", "Password" }
                    input {
                        id: "password",
                        r#type: "password",
                        value: "{password}",
                        oninput: move |e| password.set(e.value()),
                        autocomplete: "current-password",
                    }
                }
                button {
                    class: "gs-btn gs-btn--primary",
                    disabled: *auth.busy.read(),
                    onclick: on_submit,
                    if *auth.busy.read() { "Signing in…" } else { "Sign in" }
                }
                p { class: "gs-hint",
                    "Dev default: admin@geosyntra.com / GeoSyntra-Admin-2026!"
                }
            }
        }
    }
}
