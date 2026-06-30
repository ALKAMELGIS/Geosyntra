use dioxus::prelude::*;
use serde_json::{json, Map, Value};

#[component]
pub fn AttrRowEditor(
    label: String,
    value: Value,
    on_change: EventHandler<Value>,
    #[props(default = "+ Add row".to_string())] add_label: String,
) -> Element {
    let rows: Vec<(String, String)> = value
        .as_object()
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), attr_value_text(v)))
                .collect()
        })
        .unwrap_or_default();

    rsx! {
        div { class: "gs-field gs-field--grow",
            span { class: "gs-field-label", "{label}" }
            div { class: "gs-attr-rows",
                for (idx, (k, v)) in rows.iter().enumerate() {
                    {
                        let key = k.clone();
                        let val = v.clone();
                        let snapshot = value.clone();
                        let snapshot_key = snapshot.clone();
                        let snapshot_val = snapshot.clone();
                        rsx! {
                            div { class: "gs-attr-row", key: "attr-{idx}",
                                input {
                                    class: "gs-input",
                                    placeholder: "key",
                                    value: "{key}",
                                    oninput: move |e| {
                                        patch_row(&snapshot_key, idx, Some(e.value()), None, on_change);
                                    },
                                }
                                input {
                                    class: "gs-input",
                                    placeholder: "value",
                                    value: "{val}",
                                    oninput: move |e| {
                                        patch_row(&snapshot_val, idx, None, Some(e.value()), on_change);
                                    },
                                }
                                button {
                                    class: "gs-btn gs-btn--ghost gs-btn--inline",
                                    r#type: "button",
                                    onclick: {
                                        let snapshot = value.clone();
                                        move |_| remove_row(&snapshot, idx, on_change)
                                    },
                                    "Remove"
                                }
                            }
                        }
                    }
                }
                button {
                    class: "gs-btn gs-btn--ghost gs-btn--inline",
                    r#type: "button",
                    onclick: move |_| {
                        let mut obj = value.as_object().cloned().unwrap_or_default();
                        let n = obj.len();
                        obj.insert(format!("key{n}"), json!(""));
                        on_change.call(Value::Object(obj));
                    },
                    "{add_label}"
                }
            }
        }
    }
}

fn attr_value_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        _ => v.to_string(),
    }
}

fn rows_from_value(value: &Value) -> Vec<(String, String)> {
    value
        .as_object()
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), attr_value_text(v)))
                .collect()
        })
        .unwrap_or_default()
}

fn patch_row(
    value: &Value,
    idx: usize,
    new_key: Option<String>,
    new_val: Option<String>,
    on_change: EventHandler<Value>,
) {
    let mut rows = rows_from_value(value);
    if let Some(row) = rows.get_mut(idx) {
        if let Some(k) = new_key {
            row.0 = k;
        }
        if let Some(v) = new_val {
            row.1 = v;
        }
    }
    on_change.call(rows_to_value(&rows));
}

fn remove_row(value: &Value, idx: usize, on_change: EventHandler<Value>) {
    let mut rows = rows_from_value(value);
    if idx < rows.len() {
        rows.remove(idx);
    }
    on_change.call(rows_to_value(&rows));
}

fn rows_to_value(rows: &[(String, String)]) -> Value {
    let mut map = Map::new();
    for (k, v) in rows {
        if k.trim().is_empty() {
            continue;
        }
        let parsed = serde_json::from_str(v).unwrap_or(json!(v));
        map.insert(k.trim().to_string(), parsed);
    }
    Value::Object(map)
}
