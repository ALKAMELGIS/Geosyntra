use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    components::settings::SettingsShell,
};

#[component]
pub fn SettingsProfile() -> Element {
    let auth = AuthContext::use_auth();
    let session = auth.session.read().clone();

    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "Profile" }
                p { class: "gs-page-lead", "Session details restored from Axum auth." }

                div { class: "gs-card",
                    dl { class: "gs-dl",
                        dt { "Name" }
                        dd { "{session.display_name()}" }
                        dt { "Email" }
                        dd { "{session.email.clone().unwrap_or_else(|| \"—\".into())}" }
                        dt { "Role" }
                        dd {
                            "{session.role.clone().unwrap_or_else(|| session.role_slug.clone().unwrap_or_else(|| \"—\".into()))}"
                        }
                        dt { "Status" }
                        dd { "{session.status.clone().unwrap_or_else(|| \"—\".into())}" }
                        dt { "Tenant" }
                        dd { code { "{session.active_tenant()}" } }
                    }
                }
            }
        }
    }
}
