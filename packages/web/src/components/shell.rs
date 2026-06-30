use dioxus::prelude::*;

#[component]
pub fn Shell() -> Element {
    rsx! {
        div { class: "gs-app",
            div { class: "gs-shell",
                aside { class: "gs-sidebar",
                    div { class: "gs-sidebar__brand", "GeoSyntra Admin" }
                    nav { class: "gs-nav",
                        a { class: "gs-nav-link gs-nav-link--active", href: "#", "Dioxus shell" }
                        a { class: "gs-nav-link", href: "#", "Policies (Task 22)" }
                        a { class: "gs-nav-link", href: "#", "Users (Task 22)" }
                        span { class: "gs-nav-link", style: "opacity:0.45", "Desktop (Task 26)" }
                    }
                }
                main { class: "gs-main",
                    div { class: "gs-card",
                        span { class: "gs-badge gs-badge--task", "Task 20" }
                        h1 { class: "gs-page-title", "Dioxus fullstack foundation" }
                        p { class: "gs-page-lead",
                            "SCSS design tokens, shared API client, and auth session modules. "
                            "Auth shell lands in Task 21; admin console in Task 22."
                        }
                        p { class: "gs-hint",
                            "Run: bash scripts/dev-dioxus-with-axum.sh — or cargo run -p geosyntra-web (SSR on :8080)."
                        }
                        ApiStatus {}
                    }
                }
            }
        }
    }
}

#[component]
fn ApiStatus() -> Element {
    let mut status = use_signal(|| String::from("Checking API…"));

    use_effect(move || {
        spawn(async move {
            let client = crate::api_client::ApiClient::from_env();
            match client.health().await {
                Ok(()) => status.set(format!("API OK ({})", client.base())),
                Err(err) => status.set(crate::error_display::display_api_error(&err)),
            }
        });
    });

    rsx! {
        p { class: "gs-page-lead", "{status}" }
    }
}
