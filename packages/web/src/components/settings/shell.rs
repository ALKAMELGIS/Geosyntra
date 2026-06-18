use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    routes::Route,
};

#[component]
pub fn SettingsShell(children: Element) -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();
    let session = auth.session.read().clone();
    let session_gate = session.clone();

    use_effect(move || {
        if !session_gate.is_signed_in() {
            let _ = nav.push(Route::Login {});
        }
    });

    if !session.is_signed_in() {
        return rsx! {
            div { class: "gs-app gs-main",
                p { class: "gs-hint", "Sign in to open settings." }
            }
        };
    }

    rsx! {
        div { class: "gs-app",
            div { class: "gs-shell",
                aside { class: "gs-sidebar gs-sidebar--settings",
                    div { class: "gs-sidebar__brand", "Settings" }
                    p { class: "gs-hint gs-sidebar__meta", "Tenant: {session.active_tenant()}" }
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
                            style: if session.can_manage_api_integrations() { "" } else { "opacity:0.45; pointer-events:none" },
                            "API integrations"
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
