use application::dto::audit::AuditEntryView;
use serde_json::{json, Value};

pub fn audit_entry_to_json(entry: &AuditEntryView) -> Value {
    json!({
        "at": entry.at.as_ref().map(|t| t.datetime()),
        "actor": entry.actor,
        "action": entry.action,
        "target": entry.target,
    })
}
