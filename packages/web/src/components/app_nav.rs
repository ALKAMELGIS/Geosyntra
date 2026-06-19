use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    i18n::LanguageToggle,
    landing::{LandingStatusBar, BRAND, NAV_ITEMS},
    onboarding::scroll_to_hash,
    routes::Route,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AppNavSection {
    Home,
    Dashboard,
    GeoAi,
    Settings,
    Admin,
}

fn link_class(section: AppNavSection, active: AppNavSection) -> &'static str {
    if section == active {
        "gs-app-nav__link gs-app-nav__link--active"
    } else {
        "gs-app-nav__link"
    }
}

/// Shared top navbar — landing, dashboard, and GIS workspace (Task 28.16).
#[component]
pub fn AppNavBar(
    active: AppNavSection,
    #[props(default)] subtitle: Option<String>,
) -> Element {
    let auth = AuthContext::use_auth();
    let session = auth.session.read().clone();
    let signed_in = session.is_signed_in();
    let show_admin = session.can_access_admin();

    rsx! {
        header { class: "gs-app-nav",
            Link { to: Route::Landing {}, class: "gs-app-nav__brand", "{BRAND}" }
            if let Some(sub) = subtitle {
                span { class: "gs-app-nav__subtitle", "{sub}" }
            } else {
                span { class: "gs-app-nav__subtitle gs-app-nav__subtitle--empty" }
            }
            nav { class: "gs-app-nav__links",
                if signed_in {
                    Link {
                        to: Route::Landing {},
                        class: link_class(AppNavSection::Home, active),
                        "Home"
                    }
                    Link {
                        to: Route::Dashboard {},
                        class: link_class(AppNavSection::Dashboard, active),
                        "Dashboard"
                    }
                    Link {
                        to: Route::SatelliteIndices {},
                        class: link_class(AppNavSection::GeoAi, active),
                        "GeoAI"
                    }
                    Link {
                        to: Route::SettingsOverview {},
                        class: link_class(AppNavSection::Settings, active),
                        "Settings"
                    }
                    if show_admin {
                        Link {
                            to: Route::AdminOverview {},
                            class: link_class(AppNavSection::Admin, active),
                            "Admin"
                        }
                    }
                } else {
                    for item in NAV_ITEMS {
                        a {
                            class: "gs-app-nav__link",
                            href: "{item.href}",
                            onclick: move |e| {
                                e.prevent_default();
                                scroll_to_hash(item.href);
                            },
                            "{item.label}"
                        }
                    }
                }
                LanguageToggle {}
                LandingStatusBar {}
            }
        }
    }
}
