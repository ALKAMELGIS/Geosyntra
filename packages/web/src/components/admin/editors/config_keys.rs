use dioxus::prelude::*;
use serde_json::{json, Value};

use crate::components::admin::forms::TextField;

pub const PLATFORM_CONFIG_KEYS: &[&str] = &[
    "signup_enabled",
    "maintenance_mode",
    "default_trial_days",
    "support_email",
];

pub const TENANT_CONFIG_KEYS: &[&str] = &["max_seats", "enable_satellite", "support_tier"];

fn value_as_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

fn is_bool_key(key: &str) -> bool {
    matches!(key, "signup_enabled" | "maintenance_mode" | "enable_satellite")
}

#[component]
pub fn ConfigKeysEditor(
    keys: &'static [&'static str],
    values: Value,
    on_change: EventHandler<Value>,
) -> Element {
    rsx! {
        div { class: "gs-config-keys",
            for key in keys.iter().copied() {
                {
                    let current = values.get(key).cloned().unwrap_or(json!(null));
                    if is_bool_key(key) {
                        let checked = current.as_bool().unwrap_or(false);
                        let key_owned = key.to_string();
                        let values_snapshot = values.clone();
                        rsx! {
                            label { class: "gs-checkbox gs-config-key", key: "{key}",
                                input {
                                    r#type: "checkbox",
                                    checked,
                                    onchange: move |e| {
                                        let mut obj = values_snapshot
                                            .as_object()
                                            .cloned()
                                            .unwrap_or_default();
                                        obj.insert(key_owned.clone(), json!(e.checked()));
                                        on_change.call(Value::Object(obj));
                                    },
                                }
                                " {key}"
                            }
                        }
                    } else if key == "support_email" || key == "support_tier" {
                        let val = value_as_string(&current);
                        let key_owned = key.to_string();
                        let values_snapshot = values.clone();
                        rsx! {
                            TextField {
                                label: key.to_string(),
                                value: val,
                                on_input: move |e: FormEvent| {
                                    let mut obj = values_snapshot
                                        .as_object()
                                        .cloned()
                                        .unwrap_or_default();
                                    obj.insert(key_owned.clone(), json!(e.value()));
                                    on_change.call(Value::Object(obj));
                                },
                            }
                        }
                    } else {
                        let val = value_as_string(&current);
                        let key_owned = key.to_string();
                        let values_snapshot = values.clone();
                        rsx! {
                            div { class: "gs-field", key: "{key}",
                                label { "{key}" }
                                input {
                                    r#type: "number",
                                    class: "gs-input",
                                    value: "{val}",
                                    oninput: move |e| {
                                        let mut obj = values_snapshot
                                            .as_object()
                                            .cloned()
                                            .unwrap_or_default();
                                        let raw = e.value();
                                        let v = if raw.parse::<i64>().is_ok() {
                                            json!(raw.parse::<i64>().unwrap_or(0))
                                        } else {
                                            json!(raw)
                                        };
                                        obj.insert(key_owned.clone(), v);
                                        on_change.call(Value::Object(obj));
                                    },
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
