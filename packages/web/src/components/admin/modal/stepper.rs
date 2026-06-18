use dioxus::prelude::*;

use super::shell::AdminModal;

#[component]
pub fn AdminStepperModal(
    open: bool,
    title: String,
    step: u32,
    total_steps: u32,
    submitting: bool,
    submit_label: String,
    on_close: EventHandler<()>,
    on_back: EventHandler<()>,
    on_next: EventHandler<()>,
    on_submit: EventHandler<()>,
    children: Element,
) -> Element {
    let on_last = step >= total_steps;
    rsx! {
        AdminModal {
            open,
            title,
            on_close,
            div { class: "gs-stepper-meta",
                span { class: "gs-stepper-label", "Step {step} of {total_steps}" }
                div { class: "gs-stepper-track",
                    for i in 1..=total_steps {
                        span {
                            class: if i <= step { "gs-stepper-dot gs-stepper-dot--active" } else { "gs-stepper-dot" },
                        }
                    }
                }
            }
            {children}
            footer { class: "gs-modal-footer",
                button {
                    class: "gs-btn gs-btn--ghost gs-btn--inline",
                    r#type: "button",
                    disabled: submitting,
                    onclick: move |_| on_close.call(()),
                    "Cancel"
                }
                if step > 1 {
                    button {
                        class: "gs-btn gs-btn--ghost gs-btn--inline",
                        r#type: "button",
                        disabled: submitting,
                        onclick: move |_| on_back.call(()),
                        "Back"
                    }
                }
                if on_last {
                    button {
                        class: "gs-btn gs-btn--primary gs-btn--inline",
                        r#type: "button",
                        disabled: submitting,
                        onclick: move |_| on_submit.call(()),
                        if submitting { "Saving…" } else { "{submit_label}" }
                    }
                } else {
                    button {
                        class: "gs-btn gs-btn--primary gs-btn--inline",
                        r#type: "button",
                        disabled: submitting,
                        onclick: move |_| on_next.call(()),
                        "Next"
                    }
                }
            }
        }
    }
}
