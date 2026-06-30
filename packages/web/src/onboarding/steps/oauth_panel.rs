//! Social sign-in buttons — Google, GitHub, LinkedIn.

use dioxus::prelude::*;

use crate::{
    auth_session::AuthContext,
    oauth_client::{load_oauth_config, provider_configured, start_oauth_sign_in, OAuthProvider},
};

#[component]
pub fn OAuthGlassPanel(
    remember: bool,
    on_error: EventHandler<String>,
    on_success: EventHandler<()>,
) -> Element {
    let mut auth = AuthContext::use_auth();
    let mut loading = use_signal(|| None::<OAuthProvider>);
    let mut configured = use_signal(Vec::<OAuthProvider>::new);

    use_effect(move || {
        spawn(async move {
            if let Ok(cfg) = load_oauth_config().await {
                let mut list = Vec::new();
                for p in [OAuthProvider::Google, OAuthProvider::Linkedin, OAuthProvider::Github] {
                    if provider_configured(&cfg, p) {
                        list.push(p);
                    }
                }
                configured.set(list);
            }
        });
    });

    let providers = configured();
    if providers.is_empty() {
        return rsx! {
            p { class: "gs-wizard-oauth__hint",
                "Configure GOOGLE_, GITHUB_, or LINKEDIN_ OAuth keys on the API server to enable social sign-in."
            }
        };
    }

    rsx! {
        div {
            class: "gs-oauth-glass-panel",
            role: "group",
            aria_label: "Social sign-in",

            for provider in providers {
                button {
                    class: match provider {
                        OAuthProvider::Google => "gs-oauth-glass-icon gs-oauth-glass-icon--google",
                        OAuthProvider::Linkedin => "gs-oauth-glass-icon gs-oauth-glass-icon--linkedin",
                        OAuthProvider::Github => "gs-oauth-glass-icon gs-oauth-glass-icon--github",
                    },
                    r#type: "button",
                    disabled: (auth.busy)() || loading().is_some(),
                    aria_label: "{provider.label()}",
                    title: "{provider.label()}",
                    onclick: move |_| {
                        let remember = remember;
                        spawn(async move {
                            loading.set(Some(provider));
                            auth.busy.set(true);
                            auth.error.set(None);
                            match start_oauth_sign_in(provider, remember).await {
                                Ok(session) => {
                                    auth.set_session(session);
                                    on_success.call(());
                                }
                                Err(err) if err.is_empty() => {}
                                Err(err) => on_error.call(err),
                            }
                            loading.set(None);
                            auth.busy.set(false);
                        });
                    },
                    if loading() == Some(provider) {
                        span { class: "gs-oauth-glass-icon__spinner", aria_hidden: "true" }
                    } else {
                        i {
                            class: match provider {
                                OAuthProvider::Google => "fa-brands fa-google",
                                OAuthProvider::Linkedin => "fa-brands fa-linkedin-in",
                                OAuthProvider::Github => "fa-brands fa-github",
                            },
                            aria_hidden: "true"
                        }
                    }
                }
            }
        }
    }
}
