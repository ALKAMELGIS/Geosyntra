use dioxus::prelude::*;

#[component]
pub fn TextField(
    label: String,
    value: String,
    on_input: EventHandler<FormEvent>,
    #[props(default = String::new())] placeholder: String,
    #[props(default = String::new())] hint: String,
    #[props(default = format!("gs-field-{}", label.to_lowercase().replace(' ', "-")))] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "{label}" }
            input {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                placeholder: "{placeholder}",
                oninput: on_input,
            }
            if !hint.is_empty() {
                p { class: "gs-field-hint", "{hint}" }
            }
        }
    }
}

#[component]
pub fn TextAreaField(
    label: String,
    value: String,
    on_input: EventHandler<FormEvent>,
    #[props(default = String::new())] placeholder: String,
    #[props(default = format!("gs-textarea-{}", label.to_lowercase().replace(' ', "-")))] field_id: String,
) -> Element {
    rsx! {
        div { class: "gs-field gs-field--grow",
            label { r#for: "{field_id}", "{label}" }
            textarea {
                id: "{field_id}",
                class: "gs-input",
                value: "{value}",
                placeholder: "{placeholder}",
                rows: "3",
                oninput: on_input,
            }
        }
    }
}

#[component]
pub fn ReadOnlyMeta(label: String, value: String) -> Element {
    rsx! {
        div { class: "gs-field",
            span { class: "gs-field-label", "{label}" }
            code { class: "gs-readonly-id", "{value}" }
        }
    }
}
