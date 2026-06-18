//! Auth cache adapters (Task 23.6).

mod noop;
mod policy_codec;
mod redis;

pub use noop::NoopAuthCache;
pub use redis::RedisAuthCache;

use std::sync::Arc;
use std::time::Duration;

use application::ports::AuthCache;

const DEFAULT_SESSION_TTL_SEC: u64 = 900;
const DEFAULT_ROLE_TTL_SEC: u64 = 3600;
const DEFAULT_POLICY_TTL_SEC: u64 = 900;

pub fn session_ttl() -> Duration {
    Duration::from_secs(env_u64("GEOSYNTRA_REDIS_SESSION_TTL_SEC", DEFAULT_SESSION_TTL_SEC))
}

pub fn role_ttl() -> Duration {
    Duration::from_secs(env_u64("GEOSYNTRA_REDIS_ROLE_TTL_SEC", DEFAULT_ROLE_TTL_SEC))
}

pub fn policy_ttl() -> Duration {
    Duration::from_secs(env_u64("GEOSYNTRA_REDIS_POLICY_TTL_SEC", DEFAULT_POLICY_TTL_SEC))
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

pub fn redis_enabled() -> bool {
    match std::env::var("GEOSYNTRA_REDIS_ENABLED").as_deref() {
        Ok("0" | "false" | "no") => false,
        Ok("1" | "true" | "yes") => true,
        _ => std::env::var("REDIS_URL")
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false),
    }
}

/// Build Redis cache when configured; otherwise noop (Postgres-only path).
pub async fn build_auth_cache_from_env() -> Arc<dyn AuthCache> {
    if !redis_enabled() {
        return Arc::new(NoopAuthCache);
    }
    match RedisAuthCache::connect_from_env().await {
        Ok(cache) => {
            tracing::info!("Redis auth cache connected");
            Arc::new(cache)
        }
        Err(err) => {
            tracing::warn!(error = %err, "Redis unavailable — auth cache disabled");
            Arc::new(NoopAuthCache)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn redis_enabled_respects_explicit_false() {
        let _lock = ENV_TEST_LOCK.lock().unwrap();
        unsafe {
            std::env::set_var("GEOSYNTRA_REDIS_ENABLED", "false");
            std::env::remove_var("REDIS_URL");
        }
        assert!(!redis_enabled());
        unsafe {
            std::env::remove_var("GEOSYNTRA_REDIS_ENABLED");
        }
    }

    #[test]
    fn redis_enabled_when_redis_url_set() {
        let _lock = ENV_TEST_LOCK.lock().unwrap();
        unsafe {
            std::env::remove_var("GEOSYNTRA_REDIS_ENABLED");
            std::env::set_var("REDIS_URL", "redis://127.0.0.1:6379/0");
        }
        assert!(redis_enabled());
        unsafe {
            std::env::remove_var("REDIS_URL");
        }
    }

    #[test]
    fn session_ttl_defaults_to_fifteen_minutes() {
        unsafe {
            std::env::remove_var("GEOSYNTRA_REDIS_SESSION_TTL_SEC");
        }
        assert_eq!(session_ttl(), Duration::from_secs(900));
    }
}
