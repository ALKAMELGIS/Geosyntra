use dioxus::prelude::*;

use super::app_nav::{AppNavBar, AppNavSection};

#[component]
pub fn AppLayout(
    active: AppNavSection,
    title: String,
    lead: String,
    children: Element,
) -> Element {
    rsx! {
        div { class: "gs-app gs-app--with-nav",
            AppNavBar { active }
            main { class: "gs-main gs-main--app",
                h1 { class: "gs-page-title", "{title}" }
                p { class: "gs-page-lead", "{lead}" }
                {children}
            }
        }
    }
}
