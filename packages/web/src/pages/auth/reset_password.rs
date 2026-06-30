use dioxus::prelude::*;

use crate::{auth_api, routes::Route};

#[component]
pub fn ResetPassword(token: Option<String>) -> Element {
    let mut password = use_signal(String::new);
    let mut confirm = use_signal(String::new);
    let mut error = use_signal(|| None::<String>);
    let mut done = use_signal(|| false);
    let mut busy = use_signal(|| false);
    let token_val = token.unwrap_or_default();

    rsx! {
        div { class: "gs-app gs-auth",
            div { class: "gs-auth-card gs-auth-card--verify",
                if done() {
                    h1 { class: "gs-page-title", "Password updated" }
                    p { class: "gs-auth-success",
                        "Your password was reset successfully. Sign in with your new password."
                    }
                    Link { to: Route::Login {}, class: "gs-btn gs-btn--primary",
                        "Back to sign in"
                    }
                } else {
                    h1 { class: "gs-page-title", "Reset password" }
                    p { class: "gs-page-lead",
                        "Choose a new password for your GeoSyntra account."
                    }
                    if let Some(err) = error.read().clone() {
                        p { class: "gs-error", "{err}" }
                    }
                    div { class: "gs-field",
                        label { r#for: "new-password", "New password" }
                        input {
                            id: "new-password",
                            r#type: "password",
                            value: "{password}",
                            oninput: move |e| password.set(e.value()),
                            autocomplete: "new-password",
                        }
                    }
                    div { class: "gs-field",
                        label { r#for: "confirm-password", "Confirm password" }
                        input {
                            id: "confirm-password",
                            r#type: "password",
                            value: "{confirm}",
                            oninput: move |e| confirm.set(e.value()),
                            autocomplete: "new-password",
                        }
                    }
                    button {
                        class: "gs-btn gs-btn--primary",
                        disabled: busy(),
                        onclick: move |_| {
                            let token = token_val.clone();
                            let pw = password.read().clone();
                            let confirm_pw = confirm.read().clone();
                            if token.trim().is_empty() {
                                error.set(Some(
                                    "Missing reset token. Request a new link from the sign-in screen."
                                        .into(),
                                ));
                                return;
                            }
                            if pw.len() < 8 {
                                error.set(Some("Password must be at least 8 characters.".into()));
                                return;
                            }
                            if pw != confirm_pw {
                                error.set(Some("Passwords do not match.".into()));
                                return;
                            }
                            spawn(async move {
                                busy.set(true);
                                error.set(None);
                                match auth_api::reset_password(&token, &pw).await {
                                    Ok(_) => done.set(true),
                                    Err(err) => error.set(Some(err.user_message())),
                                }
                                busy.set(false);
                            });
                        },
                        if busy() { "Updating…" } else { "Update password" }
                    }
                    Link { to: Route::Login {}, class: "gs-btn gs-btn--ghost",
                        "Back to sign in"
                    }
                }
            }
        }
    }
}
