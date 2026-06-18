use chrono::{Duration, Utc};

pub fn generate_verification_token() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

pub fn verification_expires_at() -> String {
    (Utc::now() + Duration::hours(1)).to_rfc3339()
}

pub fn password_reset_expires_at() -> String {
    (Utc::now() + Duration::hours(1)).to_rfc3339()
}

pub fn is_token_expired(expires_at: &str) -> bool {
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(expires_at) else {
        return true;
    };
    parsed <= Utc::now()
}
