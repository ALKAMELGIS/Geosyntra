use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

/// Non-secret platform toggles writable via governance `config.update`.
pub const ALLOWLISTED_KEYS: &[&str] = &[
    "signup_enabled",
    "maintenance_mode",
    "default_trial_days",
    "support_email",
];

pub fn default_settings() -> Value {
    json!({
        "signup_enabled": true,
        "maintenance_mode": false,
        "default_trial_days": 14,
        "support_email": "support@geosyntra.com",
    })
}

pub fn filter_allowlisted_patch(patch: &Value) -> AppResult<Value> {
    let Some(obj) = patch.as_object() else {
        return Err(AppError::ValidationError(
            "config patch must be a JSON object".into(),
        ));
    };
    if obj.is_empty() {
        return Err(AppError::ValidationError(
            "config patch must include at least one key".into(),
        ));
    }
    for key in obj.keys() {
        if !ALLOWLISTED_KEYS.contains(&key.as_str()) {
            return Err(AppError::ValidationError(format!(
                "config key not allowlisted:{key}"
            )));
        }
    }
    Ok(patch.clone())
}
