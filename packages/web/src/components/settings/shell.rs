use dioxus::prelude::*;

use crate::{
    auth_session::{AuthContext, AuthSession},
    i18n::LanguageToggle,
    routes::Route,
};

#[component]
pub fn SettingsShell(children: Element) -> Element {
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
        if !auth.session.read().is_signed_in() {
            let _ = nav.push(Route::Login {});
        }
    });

    if !session().is_signed_in() {
        let pending = !session().is_signed_in() && AuthSession::read_local().is_signed_in();
        return rsx! {
            div { class: "gs-app gs-main",
                p { class: "gs-hint",
                    if pending { "Loading settings…" } else { "Sign in to open settings." }
                }
            }
        };
    }

    rsx! {
        div { class: "gs-app",
            div { class: "gs-shell",
                aside { class: "gs-sidebar gs-sidebar--settings",
                    div { class: "gs-sidebar__brand", "Settings" }
                    p { class: "gs-hint gs-sidebar__meta", "Tenant: {session().active_tenant()}" }
                    div { class: "gs-sidebar__tools", LanguageToggle {} }
                    nav { class: "gs-nav",
                        Link {
                            to: Route::SettingsOverview {},
                            class: "gs-nav-link",
                            "Overview"
                        }
                        Link {
                            to: Route::SettingsProfile {},
                            class: "gs-nav-link",
                            "Profile"
                        }
                        Link {
                            to: Route::SettingsApiIntegrations {},
                            class: "gs-nav-link",
                            style: if session().can_manage_api_integrations() { "" } else { "opacity:0.45; pointer-events:none" },
                            "API integrations"
                        }
                        Link {
                            to: Route::SettingsGisContent {},
                            class: "gs-nav-link",
                            "GIS content"
                        }
                        Link {
                            to: Route::Dashboard {},
                            class: "gs-nav-link",
                            "← Dashboard"
                        }
                    }
                }
                main { class: "gs-main",
                    {children}
                }
            }
        }
    }
}
