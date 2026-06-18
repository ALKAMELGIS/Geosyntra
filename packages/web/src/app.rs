use dioxus::prelude::*;

use crate::{
    auth_session::{AuthContext, AuthSession, restore_session_from_api},
    onboarding::OnboardingContext,
    routes::Route,
};

#[component]
pub fn App() -> Element {
    let auth = AuthContext::provide(AuthSession::default());
    let _onboarding = OnboardingContext::provide();

    // Client mount: hydrate auth from localStorage, then refresh from /api/rbac/me.
    use_effect(move || {
        let local = AuthSession::read_local();
        if !local.is_signed_in() {
            return;
        }
        auth.set_session(local.clone());
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
        Router::<Route> {}
    }
}
