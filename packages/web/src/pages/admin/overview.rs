use dioxus::prelude::*;

use crate::{components::admin::AdminShell, routes::Route};

#[component]
pub fn AdminOverview() -> Element {
    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                span { class: "gs-badge gs-badge--task", "Task 22" }
                h1 { class: "gs-page-title", "Admin overview" }
                p { class: "gs-page-lead",
                    "Axum-native admin UI — policy versions, user lifecycle, and system token status."
                }
                div { class: "gs-admin-grid",
                    Link { to: Route::AdminGovernance {}, class: "gs-admin-tile",
                        h2 { "Governance inbox" }
                        p { "Review and approve platform changes requiring multi-admin quorum." }
                    }
                    Link { to: Route::PolicyList {}, class: "gs-admin-tile",
                        h2 { "Policy versions" }
                        p { "Create, edit ABAC rules, and activate tenant policy versions." }
                    }
                    Link { to: Route::AdminUsers {}, class: "gs-admin-tile",
                        h2 { "Users" }
                        p { "Approve pending accounts, suspend, or reactivate users." }
                    }
                    Link { to: Route::AdminTeam {}, class: "gs-admin-tile",
                        h2 { "Team & invites" }
                        p { "Send role invites and approve pending signups." }
                    }
                    Link { to: Route::AdminRoles {}, class: "gs-admin-tile",
                        h2 { "Roles & permissions" }
                        p { "View the server-enforced RBAC permission matrix." }
                    }
                    Link { to: Route::AdminAudit {}, class: "gs-admin-tile",
                        h2 { "Audit log" }
                        p { "Recent security and administration events." }
                    }
                    Link { to: Route::AdminTokens {}, class: "gs-admin-tile",
                        h2 { "System tokens" }
                        p { "Owner-only registry status for platform API credentials." }
                    }
                }
            }
        }
    }
}
