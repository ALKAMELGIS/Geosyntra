use dioxus::prelude::*;

use crate::{
    auth_session::{AuthContext, AuthSession, restore_session_from_api},
    i18n::I18nContext,
    onboarding::OnboardingContext,
    routes::Route,
};

#[component]
pub fn App() -> Element {
    let initial = AuthSession::read_local();
    if initial.is_signed_in() {
        AuthSession::write(initial.clone());
    }
    let auth = AuthContext::provide(initial);
    let _onboarding = OnboardingContext::provide();
    let i18n = I18nContext::provide();
    let dir = if i18n.language.read().is_rtl() { "rtl" } else { "ltr" };

    // Re-hydrate if localStorage was seeded before WASM boot (Playwright / deep links).
    use_effect(move || {
        let local = AuthSession::read_local();
        if local.is_signed_in() && !auth.session.read().is_signed_in() {
            auth.set_session(local);
        }
    });

    // Full page reload: localStorage can lag the first interpreter tick after WASM boot.
    use_effect(move || {
        spawn(async move {
            for _ in 0..40 {
                let local = AuthSession::read_local();
                if local.is_signed_in() {
                    let needs_sync = !auth.session.read().is_signed_in()
                        || (auth.session.read().permissions.is_empty()
                            && !local.permissions.is_empty());
                    if needs_sync {
                        auth.set_session(local);
                    }
                    break;
                }
                #[cfg(all(feature = "web", target_arch = "wasm32"))]
                {
                    use wasm_bindgen_futures::JsFuture;
                    use js_sys::Promise;
                    let promise = Promise::new(&mut |resolve, _| {
                        if let Some(window) = web_sys::window() {
                            let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
                                &resolve,
                                50,
                            );
                        }
                    });
                    let _ = JsFuture::from(promise).await;
                }
                #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
                {
                    break;
                }
            }
        });
    });

    // Refresh from /api/rbac/me when a persisted session lacks permission metadata.
    use_effect(move || {
        let local = auth.session.read().clone();
        if !local.is_signed_in() {
            return;
        }
        if !local.permissions.is_empty() {
            return;
        }
        let seed = local;
        let mut session_sig = auth.session;
        spawn(async move {
            if let Ok(session) = restore_session_from_api(seed).await {
                AuthSession::write(session.clone());
                session_sig.set(session);
            }
        });
    });

    rsx! {
        div { dir: "{dir}",
            Router::<Route> {}
        }
    }
}
