use dioxus::prelude::*;

use crate::{components::settings::SettingsShell, routes::Route};

#[component]
pub fn SettingsOverview() -> Element {
    rsx! {
        SettingsShell {
            div { class: "gs-settings-page",
                h1 { class: "gs-page-title", "Settings" }
                p { class: "gs-page-lead",
                    "Account preferences and platform integration status."
                }
                div { class: "gs-admin-grid",
                    Link { to: Route::SettingsProfile {}, class: "gs-admin-tile",
                        h2 { "Profile" }
                        p { "View your signed-in account details." }
                    }
                    Link { to: Route::SettingsApiIntegrations {}, class: "gs-admin-tile",
                        h2 { "API integrations" }
                        p { "Owner-only view of gateway token configuration." }
                    }
                    Link { to: Route::SatelliteIndices {}, class: "gs-admin-tile",
                        h2 { "GeoAI workspace" }
                        p { "Satellite intelligence hub and map bridge." }
                    }
                }
            }
        }
    }
}
