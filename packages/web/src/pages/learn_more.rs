use dioxus::prelude::*;

use crate::{
    landing::footer_columns,
    onboarding::OnboardingContext,
    routes::Route,
};

const CAPABILITIES: &[(&str, &str)] = &[
    (
        "Smart GIS workspace",
        "Vector and raster layers, styling, ArcGIS and Mapbox sources, and live attribute tables.",
    ),
    (
        "Remote sensing indices",
        "NDVI, NDMI, NDWI, EVI, and more — clipped to your AOI with multi-source imagery.",
    ),
    (
        "GeoAI assistant",
        "Ask questions about your map layers, fields, and analytics in natural language.",
    ),
    (
        "Team workspaces",
        "Role-based access, tenant isolation, and admin governance built in.",
    ),
    (
        "API integrations",
        "Connect Sentinel Hub, Mapbox, and custom data pipelines securely.",
    ),
    (
        "Enterprise ready",
        "Policies, audit logs, and platform configuration for regulated teams.",
    ),
];

#[component]
pub fn LearnMore() -> Element {
    let mut onboarding = OnboardingContext::use_onboarding();
    let columns = footer_columns();

    rsx! {
        div { class: "gs-app gs-landing gs-learn-more",
            header { class: "gs-learn-more__header",
                Link { to: Route::Landing {}, class: "gs-learn-more__back",
                    "← Back to home"
                }
                h1 { class: "gs-learn-more__title", "About GeoSyntra" }
                p { class: "gs-learn-more__lede",
                    "Spatial intelligence for teams that need GIS, remote sensing, and integration in one workspace."
                }
                button {
                    class: "gs-btn gs-btn--primary",
                    onclick: move |_| {
                        onboarding.open_wizard(
                            &crate::auth_session::AuthSession::default(),
                            crate::onboarding::WizardOpenOptions {
                                step: Some(crate::onboarding::WizardStep::Welcome),
                                auth_mode: Some(crate::onboarding::AuthMode::Signup),
                                ..Default::default()
                            },
                        );
                    },
                    "Start free trial"
                }
            }

            section { class: "gs-learn-more__grid",
                for (title, desc) in CAPABILITIES {
                    div { class: "gs-card gs-learn-more__card",
                        h2 { class: "gs-learn-more__card-title", "{title}" }
                        p { "{desc}" }
                    }
                }
            }

            footer { class: "gs-landing-footer gs-learn-more__footer",
                div { class: "gs-landing-footer__grid",
                    for col in columns {
                        div {
                            h3 { class: "gs-landing-footer__title", "{col.title}" }
                            ul { class: "gs-landing-footer__links",
                                for link in col.links {
                                    li {
                                        if link.href == "/learn-more" {
                                            span { class: "gs-landing-footer__link", "{link.label}" }
                                        } else {
                                            Link {
                                                to: Route::Landing {},
                                                class: "gs-landing-footer__link",
                                                "{link.label}"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
