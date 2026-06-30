//! Load repo-local dev secrets (`.envrc.local`) before reading process env.
//! Mirrors `scripts/dev-dioxus-with-axum.sh` — does not override existing vars.

use std::path::PathBuf;

pub fn load_envrc_local() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let local = manifest.join("../../.envrc.local");
    if !local.is_file() {
        return;
    }
    let content = match std::fs::read_to_string(&local) {
        Ok(c) => c,
        Err(err) => {
            tracing::warn!("could not read {}: {err}", local.display());
            return;
        }
    };
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, raw_val)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() || std::env::var_os(key).is_some() {
            continue;
        }
        let mut val = raw_val.trim().to_string();
        if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
            val = val[1..val.len() - 1].to_string();
        }
        unsafe {
            std::env::set_var(key, val);
        }
    }
    tracing::info!("loaded dev env from {}", local.display());
}
