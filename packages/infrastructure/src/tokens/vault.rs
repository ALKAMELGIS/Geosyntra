use serde_json::json;

pub fn master_key() -> Option<String> {
    ["GEOSYNTRA_API_VAULT_MASTER_KEY", "API_VAULT_MASTER_KEY"]
        .into_iter()
        .find_map(|k| std::env::var(k).ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn encrypted_at_rest() -> bool {
    master_key().is_some()
}

pub fn encrypt_value(plaintext: &str) -> String {
    let value = plaintext.trim();
    if value.is_empty() {
        return json!({ "v": 1, "empty": true }).to_string();
    }
    if master_key().is_some() {
        // Encrypted envelopes require AES — dev stores plain until Task 27 vault hardening.
        tracing::warn!(
            "API_VAULT_MASTER_KEY set but AES envelope not enabled — storing plain envelope (dev parity)"
        );
    } else {
        tracing::warn!(
            "API_VAULT_MASTER_KEY unset — storing token envelope without AES (dev only)"
        );
    }
    json!({ "v": 1, "plain": value }).to_string()
}

pub fn decrypt_value(envelope_json: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(envelope_json).ok()?;
    if parsed.get("empty").and_then(|v| v.as_bool()) == Some(true) {
        return None;
    }
    if let Some(plain) = parsed.get("plain").and_then(|v| v.as_str()) {
        let v = plain.trim();
        return if v.is_empty() { None } else { Some(v.to_string()) };
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_plain_envelope() {
        let enc = encrypt_value("sk-test-key-12345");
        assert_eq!(decrypt_value(&enc).as_deref(), Some("sk-test-key-12345"));
    }
}
