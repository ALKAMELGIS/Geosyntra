use dioxus::prelude::*;

use crate::{
    auth_session::{AuthContext, AuthSession, restore_session_from_api},
    i18n::I18nContext,
    onboarding::OnboardingContext,
    routes::Route,
};

#[component]
pub fn App() -> Element {
    // Hydrate from localStorage on first paint so seeded sessions work before use_effect.
    let auth = AuthContext::provide(AuthSession::read_local());
    let _onboarding = OnboardingContext::provide();
    let i18n = I18nContext::provide();
    let dir = if i18n.language.read().is_rtl() { "rtl" } else { "ltr" };

    // Refresh from /api/rbac/me when a persisted session exists.
    use_effect(move || {
        let local = auth.session.read().clone();
        if !local.is_signed_in() {
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
