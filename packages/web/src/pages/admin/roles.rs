use dioxus::prelude::*;

use crate::{
    api::admin::{bearer_token, roles::{self, role_display_label}},
    auth_session::AuthContext,
    components::admin::AdminShell,
    error_display::display_api_error,
};

fn token_from(auth: &AuthContext) -> Result<String, crate::error_display::ApiError> {
    bearer_token(&auth.session.read())
}

#[component]
pub fn AdminRoles() -> Element {
    let auth = AuthContext::use_auth();
    let mut rows = use_signal(Vec::<roles::MatrixRoleRow>::new);
    let mut loading = use_signal(|| true);
    let mut error = use_signal(|| None::<String>);

    use_effect(move || {
        spawn(async move {
            loading.set(true);
            error.set(None);
            match token_from(&auth) {
                Ok(token) => match roles::list_matrix(&token).await {
                    Ok(list) => {
                        rows.set(list);
                        loading.set(false);
                    }
                    Err(err) => {
                        error.set(Some(display_api_error(&err)));
                        loading.set(false);
                    }
                },
                Err(err) => {
                    error.set(Some(display_api_error(&err)));
                    loading.set(false);
                }
            }
        });
    });

    rsx! {
        AdminShell {
            div { class: "gs-admin-page",
                h1 { class: "gs-page-title", "Roles & permissions" }
                p { class: "gs-page-lead",
                    "Effective permissions per role (enforced on the server)."
                }

                if let Some(err) = error.read().clone() {
                    p { class: "gs-error", "{err}" }
                }

                if *loading.read() {
                    p { class: "gs-hint", "Loading permission matrix…" }
                } else if rows.read().is_empty() {
                    p { class: "gs-hint", "No matrix rows returned from the API." }
                } else {
                    div { class: "gs-table-wrap",
                        table { class: "gs-table",
                            thead {
                                tr {
                                    th { "Role" }
                                    th { "Permissions" }
                                }
                            }
                            tbody {
                                for row in rows.read().iter().cloned() {
                                    {
                                        let role = row.role.clone();
                                        rsx! {
                                            tr { key: "{role}",
                                                td {
                                                    strong { "{role_display_label(&row.role)}" }
                                                    br {}
                                                    code { class: "gs-role-slug", "{row.role}" }
                                                }
                                                td {
                                                    ul { class: "gs-perm-list",
                                                        for perm in row.permissions.iter() {
                                                            li { key: "{perm}",
                                                                code { "{perm}" }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
