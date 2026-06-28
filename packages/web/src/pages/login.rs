use dioxus::prelude::*;

use crate::{
    auth_api,
    auth_session::AuthContext,
    onboarding::steps::oauth_panel::OAuthGlassPanel,
    post_login,
    routes::Route,
};

#[cfg(all(target_arch = "wasm32", feature = "web"))]
#[allow(dead_code)]
fn post_login_path(route: &Route) -> Option<String> {
    Some(match route {
        Route::Landing {} => "/".into(),
        Route::LearnMore {} => "/learn-more".into(),
        Route::Dashboard {} => "/dashboard".into(),
        Route::Login {} | Route::AppAuthLogin {} => "/login".into(),
        Route::LegacyAuthRegister {} => "/app/auth/register".into(),
        Route::VerifyEmail { .. } => "/app/auth/verify-email".into(),
        Route::ResetPassword { .. } => "/app/auth/reset-password".into(),
        Route::LegacyBillingPricing {} => "/app/billing/pricing".into(),
        Route::LegacyTrialStart {} => "/app/onboarding/trial-start".into(),
        Route::JoinTeam { token } => format!("/join-team?token={token}"),
        Route::Satellite {} => "/satellite".into(),
        Route::SatelliteIndices {} => "/satellite/indices".into(),
        Route::Multidimensional {} => "/satellite/multidimensional".into(),
        Route::FertigationRecords {} | Route::LegacyDataFertigation {} => {
            "/data/fertigation-records".into()
        }
        Route::Recipes { form_slug } => format!("/data/recipes/{form_slug}"),
        Route::DynamicBindPage { bind_target, .. } => format!("/pages/{bind_target}"),
        Route::SettingsOverview {} => "/settings".into(),
        Route::SettingsProfile {} | Route::LegacyAccountProfile {} => "/settings/profile".into(),
        Route::SettingsApiIntegrations {} => "/settings/api-integrations".into(),
        Route::SettingsGisContent {} | Route::LegacyMasterGisContent {} => {
            "/settings/gis-content".into()
        }
        Route::SettingsGisContentItem { item_id } => {
            format!("/settings/gis-content/item/{item_id}")
        }
        Route::LegacySettingsAdmin {} => "/admin".into(),
        Route::LegacySettingsAdminUsers {} => "/admin/users".into(),
        Route::LegacySettingsAdminTeam {} => "/admin/team".into(),
        Route::LegacySettingsAdminRoles {} => "/admin/roles".into(),
        Route::LegacySettingsAdminAudit {} => "/admin/audit".into(),
        Route::LegacySettingsAdminTokens {} => "/admin/tokens".into(),
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
        Route::AdminBilling {} => "/admin/billing".into(),
        Route::AdminGitHub {} => "/admin/github".into(),
    })
}

macro_rules! navigate_after_login {
    ($nav:expr, $route:expr) => {{
        $nav.replace($route);
    }};
}

#[component]
pub fn Login() -> Element {
    let mut auth = AuthContext::use_auth();
    let nav = use_navigator();
    let mut email = use_signal(String::new);
    let mut password = use_signal(String::new);
    let mut remember = use_signal(|| false);

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
                label { class: "gs-auth-remember",
                    input {
                        r#type: "checkbox",
                        checked: remember(),
                        onchange: move |e| remember.set(e.checked()),
                    }
                    span { "Keep me signed in" }
                }
                button {
                    class: "gs-btn gs-btn--primary",
                    disabled: *auth.busy.read(),
                    onclick: on_submit,
                    if *auth.busy.read() { "Signing in…" } else { "Sign in" }
                }
                div { class: "gs-auth-oauth",
                    div { class: "gs-auth-oauth__divider",
                        span { "or continue with" }
                    }
                    OAuthGlassPanel {
                        remember: remember(),
                        on_error: move |err| {
                            auth.error.set(Some(err));
                        },
                        on_success: move |_| {
                            let session = auth.session.read().clone();
                            if session.is_signed_in() {
                                spawn(async move {
                                    let route = post_login::resolve_post_login_route(&session).await;
                                    navigate_after_login!(nav, route);
                                });
                            }
                        },
                    }
                }
                p { class: "gs-hint",
                    "Dev default: admin@geosyntra.com / GeoSyntra-Admin-2026!"
                }
            }
        }
    }
}
