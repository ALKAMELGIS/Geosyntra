use dioxus::prelude::*;

use crate::components::{AppNavBar, AppNavSection};

#[component]
pub fn LandingNav() -> Element {
    rsx! {
        AppNavBar { active: AppNavSection::Home }
    }
}
