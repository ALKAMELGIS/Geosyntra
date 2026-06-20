//! In-memory GIS external tables + relationships (Express `GIS_EXTERNAL_TABLES` parity).

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone)]
struct ExternalTable {
    name: String,
    label: String,
    primary_key: String,
    columns: Vec<Value>,
    rows: Vec<Map<String, Value>>,
}

static TABLES: OnceLock<RwLock<HashMap<String, ExternalTable>>> = OnceLock::new();
static RELATIONSHIPS: OnceLock<RwLock<Vec<Value>>> = OnceLock::new();

fn tables() -> &'static RwLock<HashMap<String, ExternalTable>> {
    TABLES.get_or_init(|| {
        let mut map = HashMap::new();
        map.insert(
            "location_master".into(),
            ExternalTable {
                name: "location_master".into(),
                label: "Location Master".into(),
                primary_key: "farm_id".into(),
                columns: vec![
                    json!({"name":"farm_id","type":"string","required":true}),
                    json!({"name":"farm_name","type":"string","required":true}),
                    json!({"name":"crop_type","type":"enum","required":true,"enum":["Wheat","Corn","Tomato","Potato"]}),
                    json!({"name":"area_ha","type":"number","required":true}),
                    json!({"name":"planted_on","type":"date","required":false}),
                    json!({"name":"status","type":"enum","required":true,"enum":["Active","Inactive"]}),
                ],
                rows: vec![
                    row(&[
                        ("farm_id", json!("F-1001")),
                        ("farm_name", json!("North Farm")),
                        ("crop_type", json!("Tomato")),
                        ("area_ha", json!(12.5)),
                        ("planted_on", json!("2026-01-11")),
                        ("status", json!("Active")),
                    ]),
                    row(&[
                        ("farm_id", json!("F-1002")),
                        ("farm_name", json!("South Farm")),
                        ("crop_type", json!("Wheat")),
                        ("area_ha", json!(54.2)),
                        ("planted_on", json!("2025-11-04")),
                        ("status", json!("Active")),
                    ]),
                ],
            },
        );
        map.insert(
            "irrigation_log".into(),
            ExternalTable {
                name: "irrigation_log".into(),
                label: "Irrigation Log".into(),
                primary_key: "log_id".into(),
                columns: vec![
                    json!({"name":"log_id","type":"string","required":true}),
                    json!({"name":"farm_id","type":"string","required":true}),
                    json!({"name":"irrigation_date","type":"date","required":true}),
                    json!({"name":"amount_mm","type":"number","required":true}),
                    json!({"name":"method","type":"enum","required":true,"enum":["Drip","Sprinkler","Flood"]}),
                    json!({"name":"notes","type":"string","required":false}),
                ],
                rows: vec![
                    row(&[
                        ("log_id", json!("L-9001")),
                        ("farm_id", json!("F-1001")),
                        ("irrigation_date", json!("2026-03-01")),
                        ("amount_mm", json!(18)),
                        ("method", json!("Drip")),
                        ("notes", json!("")),
                    ]),
                    row(&[
                        ("log_id", json!("L-9002")),
                        ("farm_id", json!("F-1001")),
                        ("irrigation_date", json!("2026-03-03")),
                        ("amount_mm", json!(16)),
                        ("method", json!("Drip")),
                        ("notes", json!("Reduced due to humidity")),
                    ]),
                    row(&[
                        ("log_id", json!("L-9010")),
                        ("farm_id", json!("F-1002")),
                        ("irrigation_date", json!("2026-02-21")),
                        ("amount_mm", json!(22)),
                        ("method", json!("Sprinkler")),
                        ("notes", json!("")),
                    ]),
                ],
            },
        );
        RwLock::new(map)
    })
}

fn relationships() -> &'static RwLock<Vec<Value>> {
    RELATIONSHIPS.get_or_init(|| RwLock::new(Vec::new()))
}

fn row(pairs: &[(&str, Value)]) -> Map<String, Value> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.clone()))
        .collect()
}

pub fn normalize_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn get_table(table_name: &str) -> Option<ExternalTable> {
    let key = normalize_key(table_name);
    tables()
        .read()
        .expect("gis tables read")
        .get(&key)
        .cloned()
}

fn has_column(table: &ExternalTable, column_name: &str) -> bool {
    table
        .columns
        .iter()
        .any(|c| c.get("name").and_then(|v| v.as_str()) == Some(column_name))
}

pub fn list_external_tables() -> Vec<Value> {
    tables()
        .read()
        .expect("gis tables read")
        .values()
        .map(|t| {
            json!({
                "name": t.name,
                "label": t.label,
                "primaryKey": t.primary_key,
                "columns": t.columns,
            })
        })
        .collect()
}

pub fn table_schema(table_name: &str) -> Option<Value> {
    get_table(table_name).map(|t| {
        json!({
            "name": t.name,
            "label": t.label,
            "primaryKey": t.primary_key,
            "columns": t.columns,
        })
    })
}

pub fn paginate_rows(
    rows: Vec<Map<String, Value>>,
    limit: i64,
    offset: i64,
) -> Value {
    let safe_limit = limit.clamp(1, 100);
    let safe_offset = offset.max(0) as usize;
    let total = rows.len();
    let items: Vec<Value> = rows
        .into_iter()
        .skip(safe_offset)
        .take(safe_limit as usize)
        .map(Value::Object)
        .collect();
    json!({
        "total": total,
        "limit": safe_limit,
        "offset": safe_offset,
        "items": items,
    })
}

pub fn list_table_rows(table_name: &str, field: Option<&str>, value: Option<&str>, limit: i64, offset: i64) -> Result<Value, &'static str> {
    let table = get_table(table_name).ok_or("Table not found")?;
    let mut rows = table.rows.clone();
    if let Some(f) = field.filter(|s| !s.is_empty()) {
        if !has_column(&table, f) {
            return Err("Unknown field");
        }
        let v = value.unwrap_or("").trim();
        rows.retain(|r| r.get(f).map(|cell| cell_to_string(cell) == v).unwrap_or(false));
    }
    Ok(paginate_rows(rows, limit, offset))
}

fn cell_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => v.to_string(),
    }
}

pub fn create_table_row(table_name: &str, body: Map<String, Value>) -> Result<Value, &'static str> {
    let key = normalize_key(table_name);
    let mut guard = tables().write().expect("gis tables write");
    let table = guard.get_mut(&key).ok_or("Table not found")?;
    let pk = table.primary_key.clone();
    let pk_value = body
        .get(&pk)
        .map(cell_to_string)
        .unwrap_or_default()
        .trim()
        .to_string();
    if pk_value.is_empty() {
        return Err("Missing primary key");
    }
    if table
        .rows
        .iter()
        .any(|r| cell_to_string(r.get(&pk).unwrap_or(&Value::Null)) == pk_value)
    {
        return Err("Row already exists");
    }
    table.rows.push(body.clone());
    Ok(Value::Object(body))
}

pub fn update_table_row(table_name: &str, row_id: &str, body: Map<String, Value>) -> Result<Value, &'static str> {
    let key = normalize_key(table_name);
    let mut guard = tables().write().expect("gis tables write");
    let table = guard.get_mut(&key).ok_or("Table not found")?;
    let pk = table.primary_key.clone();
    let row_id = row_id.trim();
    let idx = table
        .rows
        .iter()
        .position(|r| cell_to_string(r.get(&pk).unwrap_or(&Value::Null)) == row_id)
        .ok_or("Row not found")?;
    let mut next = table.rows[idx].clone();
    for (k, v) in body {
        next.insert(k, v);
    }
    next.insert(pk.clone(), table.rows[idx].get(&pk).cloned().unwrap_or(Value::Null));
    table.rows[idx] = next.clone();
    Ok(Value::Object(next))
}

pub fn delete_table_row(table_name: &str, row_id: &str) -> Result<Value, &'static str> {
    let key = normalize_key(table_name);
    let mut guard = tables().write().expect("gis tables write");
    let table = guard.get_mut(&key).ok_or("Table not found")?;
    let pk = table.primary_key.clone();
    let row_id = row_id.trim();
    let before = table.rows.len();
    table.rows.retain(|r| cell_to_string(r.get(&pk).unwrap_or(&Value::Null)) != row_id);
    if table.rows.len() == before {
        return Err("Row not found");
    }
    Ok(json!({ "success": true }))
}

pub fn list_relationships() -> Vec<Value> {
    relationships()
        .read()
        .expect("gis relationships read")
        .clone()
}

pub fn apply_value_transform(value: &Value, transform: &str) -> Value {
    match transform {
        "trim" => Value::String(value.as_str().unwrap_or("").trim().to_string()),
        "lowercase" => Value::String(value.as_str().unwrap_or("").to_ascii_lowercase()),
        "uppercase" => Value::String(value.as_str().unwrap_or("").to_ascii_uppercase()),
        "number" => {
            let n: f64 = value.as_str().unwrap_or("").trim().parse().unwrap_or(f64::NAN);
            if n.is_finite() {
                json!(n)
            } else {
                Value::Null
            }
        }
        _ => value.clone(),
    }
}

pub fn create_relationship(body: Value) -> Result<Value, &'static str> {
    let source_layer = body
        .get("sourceLayerName")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let relationship_type = body
        .get("relationshipType")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    if relationship_type != "one_to_one" && relationship_type != "one_to_many" {
        return Err("Validation failed");
    }
    let target_table = body
        .get("targetTable")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let target_key = body
        .get("targetKeyField")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let table = get_table(target_table).ok_or("Target table not found")?;
    if !has_column(&table, target_key) {
        return Err("Target key field not found");
    }
    let guard = relationships().read().expect("gis relationships read");
    let conflict = guard.iter().any(|r| {
        normalize_key(r.get("sourceLayerName").and_then(|v| v.as_str()).unwrap_or("")) == normalize_key(source_layer)
            && normalize_key(r.get("targetTable").and_then(|v| v.as_str()).unwrap_or("")) == normalize_key(&table.name)
            && r.get("relationshipType").and_then(|v| v.as_str()) == Some(relationship_type)
    });
    if conflict {
        return Err("Relationship conflict");
    }
    drop(guard);

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let rel = json!({
        "id": id,
        "sourceLayerName": source_layer,
        "relationshipType": relationship_type,
        "sourceKeyField": body.get("sourceKeyField"),
        "targetTable": table.name,
        "targetKeyField": target_key,
        "sourceKeyTransform": body.get("sourceKeyTransform").unwrap_or(&json!("none")),
        "fieldSelection": body.get("fieldSelection").cloned().unwrap_or(json!([])),
        "createdAt": now,
        "updatedAt": now,
    });
    relationships()
        .write()
        .expect("gis relationships write")
        .push(rel.clone());
    Ok(rel)
}

pub fn update_relationship(id: &str, body: Value) -> Result<Value, &'static str> {
    let mut guard = relationships().write().expect("gis relationships write");
    let idx = guard.iter().position(|r| r.get("id").and_then(|v| v.as_str()) == Some(id)).ok_or("Relationship not found")?;
    let source_layer = body
        .get("sourceLayerName")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let relationship_type = body
        .get("relationshipType")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let target_table = body
        .get("targetTable")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let target_key = body
        .get("targetKeyField")
        .and_then(|v| v.as_str())
        .ok_or("Validation failed")?;
    let table = get_table(target_table).ok_or("Target table not found")?;
    if !has_column(&table, target_key) {
        return Err("Target key field not found");
    }
    let conflict = guard.iter().enumerate().any(|(i, r)| {
        i != idx
            && normalize_key(r.get("sourceLayerName").and_then(|v| v.as_str()).unwrap_or("")) == normalize_key(source_layer)
            && normalize_key(r.get("targetTable").and_then(|v| v.as_str()).unwrap_or("")) == normalize_key(&table.name)
            && r.get("relationshipType").and_then(|v| v.as_str()) == Some(relationship_type)
    });
    if conflict {
        return Err("Relationship conflict");
    }
    let updated_at = chrono::Utc::now().to_rfc3339();
    let rel = json!({
        "id": id,
        "sourceLayerName": source_layer,
        "relationshipType": relationship_type,
        "sourceKeyField": body.get("sourceKeyField"),
        "targetTable": table.name,
        "targetKeyField": target_key,
        "sourceKeyTransform": body.get("sourceKeyTransform").unwrap_or(&json!("none")),
        "fieldSelection": body.get("fieldSelection").cloned().unwrap_or(json!([])),
        "createdAt": guard[idx].get("createdAt").cloned().unwrap_or(json!(updated_at)),
        "updatedAt": updated_at,
    });
    guard[idx] = rel.clone();
    Ok(rel)
}

pub fn delete_relationship(id: &str) -> Result<Value, &'static str> {
    let mut guard = relationships().write().expect("gis relationships write");
    let before = guard.len();
    guard.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(id));
    if guard.len() == before {
        return Err("Relationship not found");
    }
    Ok(json!({ "success": true }))
}

pub fn resolve_relationships(source_layer_name: &str, feature: &Value) -> Value {
    let rels: Vec<Value> = relationships()
        .read()
        .expect("gis relationships read")
        .iter()
        .filter(|r| {
            normalize_key(r.get("sourceLayerName").and_then(|v| v.as_str()).unwrap_or(""))
                == normalize_key(source_layer_name)
        })
        .cloned()
        .collect();

    let mut results = Vec::new();
    for r in rels {
        let target_table = r.get("targetTable").and_then(|v| v.as_str()).unwrap_or("");
        let Some(table) = get_table(target_table) else {
            continue;
        };
        let source_key_field = r
            .get("sourceKeyField")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let target_key_field = r
            .get("targetKeyField")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let transform = r
            .get("sourceKeyTransform")
            .and_then(|v| v.as_str())
            .unwrap_or("none");
        let raw_key = feature.get(source_key_field);
        let key_value = if transform != "none" {
            apply_value_transform(raw_key.unwrap_or(&Value::Null), transform)
        } else {
            raw_key.cloned().unwrap_or(Value::Null)
        };
        let key_string = match &key_value {
            Value::Null => String::new(),
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        if key_string.is_empty() {
            results.push(json!({
                "relationshipId": r.get("id"),
                "error": format!("Missing source key field: {source_key_field}"),
            }));
            continue;
        }
        let rows: Vec<Value> = table
            .rows
            .iter()
            .filter(|row| cell_to_string(row.get(target_key_field).unwrap_or(&Value::Null)) == key_string)
            .map(|row| Value::Object(row.clone()))
            .collect();
        results.push(json!({
            "relationshipId": r.get("id"),
            "relationshipType": r.get("relationshipType"),
            "targetTable": table.name,
            "targetLabel": table.label,
            "primaryKey": table.primary_key,
            "targetKeyField": target_key_field,
            "sourceKeyField": source_key_field,
            "keyValue": key_string,
            "schema": {
                "name": table.name,
                "label": table.label,
                "primaryKey": table.primary_key,
                "columns": table.columns,
            },
            "fieldSelection": r.get("fieldSelection").cloned().unwrap_or(json!([])),
            "rows": rows,
        }));
    }
    json!({ "sourceLayerName": source_layer_name, "results": results })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_seed_tables() {
        let list = list_external_tables();
        assert!(list.iter().any(|t| t.get("name").and_then(|v| v.as_str()) == Some("location_master")));
    }

    #[test]
    fn paginates_rows() {
        let page = list_table_rows("location_master", None, None, 50, 0).expect("table");
        assert_eq!(page.get("total").and_then(|v| v.as_i64()), Some(2));
    }

    #[test]
    fn resolves_relationship_rows() {
        let _ = create_relationship(json!({
            "sourceLayerName": "fields_test_resolve",
            "relationshipType": "one_to_many",
            "sourceKeyField": "farm_id",
            "targetTable": "irrigation_log",
            "targetKeyField": "farm_id",
            "sourceKeyTransform": "none",
            "fieldSelection": [],
        }))
        .expect("create rel");
        let out = resolve_relationships("fields_test_resolve", &json!({ "farm_id": "F-1001" }));
        let results = out.get("results").and_then(|v| v.as_array()).expect("results");
        assert!(!results.is_empty());
    }
}
