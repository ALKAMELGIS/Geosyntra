use std::{
    collections::HashMap,
    sync::{OnceLock, RwLock},
};

use serde_json::Value;

static STORE: OnceLock<RwLock<HashMap<String, Vec<Value>>>> = OnceLock::new();

fn store() -> &'static RwLock<HashMap<String, Vec<Value>>> {
    STORE.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn scope_key(tenant_id: &str, user_id: &str) -> String {
    format!("{}:{}", tenant_id.trim(), user_id.trim())
}

pub fn list_for_scope(scope: &str) -> Vec<Value> {
    store()
        .read()
        .expect("aoi store read lock")
        .get(scope)
        .cloned()
        .unwrap_or_default()
}

pub fn upsert(scope: &str, mut record: Value) -> Value {
    let id = record
        .get("id")
        .and_then(|v| v.as_str().map(String::from))
        .or_else(|| record.get("id").and_then(|v| v.as_i64()).map(|n| n.to_string()))
        .unwrap_or_else(|| format!("aoi-{}", chrono::Utc::now().timestamp_millis()));

    if record.get("id").is_none() {
        if let Some(obj) = record.as_object_mut() {
            obj.insert("id".into(), Value::String(id.clone()));
        }
    }

    let mut guard = store().write().expect("aoi store write lock");
    let list = guard.entry(scope.to_string()).or_default();
    if let Some(idx) = list.iter().position(|item| aoi_id(item).as_deref() == Some(id.as_str())) {
        list[idx] = record.clone();
    } else {
        list.push(record.clone());
    }
    record
}

pub fn delete(scope: &str, id: &str) -> bool {
    let mut guard = store().write().expect("aoi store write lock");
    let Some(list) = guard.get_mut(scope) else {
        return false;
    };
    let before = list.len();
    list.retain(|item| aoi_id(item).as_deref() != Some(id));
    list.len() != before
}

fn aoi_id(value: &Value) -> Option<String> {
    value
        .get("id")
        .and_then(|v| v.as_str().map(String::from))
        .or_else(|| value.get("id").and_then(|v| v.as_i64()).map(|n| n.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn upsert_and_delete_are_scoped() {
        let scope = "tenant-a:user-1";
        let other = "tenant-b:user-2";
        let saved = upsert(
            scope,
            json!({
                "name": "Field A",
                "geometry": { "type": "Point", "coordinates": [0.0, 0.0] }
            }),
        );
        let id = saved.get("id").and_then(|v| v.as_str()).expect("id");
        assert_eq!(list_for_scope(scope).len(), 1);
        assert!(list_for_scope(other).is_empty());
        assert!(delete(scope, id));
        assert!(list_for_scope(scope).is_empty());
    }
}
