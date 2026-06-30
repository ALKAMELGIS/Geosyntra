use dioxus::prelude::*;

use crate::{
    api::admin::{bearer_token, governance},
    auth_session::{AuthContext, AuthSession},
    components::admin::AdminNav,
    routes::Route,
};

async fn load_pending_count(auth: &AuthContext) -> Option<u32> {
    let token = bearer_token(&auth.session.read()).ok()?;
    governance::pending_count(&token).await.ok()
}

#[component]
pub fn AdminShell(children: Element) -> Element {
    let auth = AuthContext::use_auth();
    let nav = use_navigator();

    let session = use_memo(move || {
        let cached = auth.session.read().clone();
        if cached.is_signed_in() {
            cached
        } else {
            AuthSession::read_local()
        }
    });

    use_effect(move || {
        let local = AuthSession::read_local();
        if local.is_signed_in() && !auth.session.read().is_signed_in() {
            auth.set_session(local);
        }
    });

    let mut pending_count = use_signal(|| 0u32);

    use_context_provider(|| AdminNav {
        refresh_badge: EventHandler::new({
            let auth = auth.clone();
            move |_| {
                spawn(async move {
                    if let Some(count) = load_pending_count(&auth).await {
                        pending_count.set(count);
                    }
                });
            }
        }),
    });

    use_effect({
        let auth = auth.clone();
        move || {
            spawn(async move {
                if let Some(count) = load_pending_count(&auth).await {
                    pending_count.set(count);
                }
            });
        }
    });

    use_effect(move || {
        let session = auth.session.read().clone();
        if !session.is_signed_in() {
            let _ = nav.push(Route::Login {});
        } else if session.permissions.is_empty() {
            return;
        } else if !session.can_access_admin() {
            let _ = nav.push(Route::Dashboard {});
        }
    });

    if !session().can_access_admin() {
        let local = AuthSession::read_local();
        let pending = local.is_signed_in()
            && (!session().is_signed_in() || session().permissions.is_empty());
        return rsx! {
            div { class: "gs-app gs-main",
                p { class: "gs-hint",
                    if pending {
                        "Loading admin console…"
                    } else {
                        "Admin access requires the admin.panel permission."
                    }
                }
            }
        };
    }

    let badge = pending_count.read();
    let badge_label = if *badge > 0 {
        format!("Governance ({badge})")
    } else {
        "Governance".into()
    };

    rsx! {
        div { class: "gs-app",
            div { class: "gs-shell",
                aside { class: "gs-sidebar gs-sidebar--admin",
                    div { class: "gs-sidebar__brand", "Admin console" }
                    p { class: "gs-hint gs-sidebar__meta", "Tenant: {session().active_tenant()}" }
                    nav { class: "gs-nav",
                        Link {
                            to: Route::AdminOverview {},
                            class: "gs-nav-link",
                            "Overview"
                        }
                        Link {
                            to: Route::AdminGovernance {},
                            class: "gs-nav-link",
                            "{badge_label}"
                        }
                        Link {
                            to: Route::PolicyList {},
                            class: "gs-nav-link",
                            "Policy versions"
                        }
                        Link {
                            to: Route::AdminUsers {},
                            class: "gs-nav-link",
                            "Users"
                        }
                        Link {
                            to: Route::AdminTeam {},
                            class: "gs-nav-link",
                            "Team & invites"
                        }
                        Link {
                            to: Route::AdminRoles {},
                            class: "gs-nav-link",
                            "Roles"
                        }
                        Link {
                            to: Route::AdminAudit {},
                            class: "gs-nav-link",
                            "Audit log"
                        }
                        Link {
                            to: Route::AdminBilling {},
                            class: "gs-nav-link",
                            "Billing"
                        }
                        Link {
                            to: Route::AdminGitHub {},
                            class: "gs-nav-link",
                            "GitHub"
                        }
                        Link {
                            to: Route::AdminTenants {},
                            class: "gs-nav-link",
                            "Tenants"
                        }
                        Link {
                            to: Route::AdminMemberships {},
                            class: "gs-nav-link",
                            "Memberships"
                        }
                        Link {
                            to: Route::AdminGrants {},
                            class: "gs-nav-link",
                            "Grants"
                        }
                        Link {
                            to: Route::AdminPlatform {},
                            class: "gs-nav-link",
                            "Platform config"
                        }
                        Link {
                            to: Route::AdminTokens {},
                            class: "gs-nav-link",
                            "System tokens"
                        }
                        Link {
                            to: Route::Dashboard {},
                            class: "gs-nav-link",
                            "← Dashboard"
                        }
                    }
                }
                main { class: "gs-main",
                    {children}
                }
            }
        }
    }
}
