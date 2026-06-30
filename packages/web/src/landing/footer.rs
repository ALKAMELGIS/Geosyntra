use dioxus::prelude::*;

use crate::{onboarding::scroll_to_hash, routes::Route};

use super::content::{footer_columns, BRAND};

#[component]
pub fn LandingFooter() -> Element {
    let columns = footer_columns();
    rsx! {
        footer { class: "gs-landing-footer",
            div { class: "gs-landing-footer__grid",
                for column in columns {
                    div { class: "gs-landing-footer__column",
                        h3 { class: "gs-landing-footer__title", "{column.title}" }
                        ul { class: "gs-landing-footer__links",
                            for link in column.links {
                                li {
                                    if link.external {
                                        a {
                                            class: "gs-landing-footer__link",
                                            href: "{link.href}",
                                            target: "_blank",
                                            rel: "noopener noreferrer",
                                            "{link.label}"
                                        }
                                    } else if link.href.starts_with('#') {
                                        a {
                                            class: "gs-landing-footer__link",
                                            href: "{link.href}",
                                            onclick: {
                                                let href = link.href.clone();
                                                move |e| {
                                                    e.prevent_default();
                                                    scroll_to_hash(&href);
                                                }
                                            },
                                            "{link.label}"
                                        }
                                    } else if link.href == "/satellite" {
                                        Link {
                                            to: Route::Satellite {},
                                            class: "gs-landing-footer__link",
                                            "{link.label}"
                                        }
                                    } else {
                                        a {
                                            class: "gs-landing-footer__link",
                                            href: "{link.href}",
                                            "{link.label}"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            p { class: "gs-landing-footer__copy",
                "© {BRAND} · Satellite intelligence platform"
            }
        }
    }
}
