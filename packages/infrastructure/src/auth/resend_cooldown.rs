use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

const COOLDOWN: Duration = Duration::from_secs(60);

static RESEND_COOLDOWN: LazyLock<Mutex<HashMap<String, Instant>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn check_cooldown(key: &str) -> Result<(), u64> {
    let map = RESEND_COOLDOWN.lock().expect("resend cooldown");
    if let Some(last) = map.get(key) {
        let elapsed = last.elapsed();
        if elapsed < COOLDOWN {
            return Err((COOLDOWN - elapsed).as_secs().max(1));
        }
    }
    Ok(())
}

pub fn mark_sent(key: &str) {
    RESEND_COOLDOWN
        .lock()
        .expect("resend cooldown")
        .insert(key.to_string(), Instant::now());
}
