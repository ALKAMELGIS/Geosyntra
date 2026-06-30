//! Auth route rate limit — mirrors Express `authRateLimit.js` (120 / 15 min).

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};

#[derive(Clone)]
pub struct AuthRateLimiter {
    buckets: Arc<Mutex<HashMap<String, (u32, Instant)>>>,
    max: u32,
    window: Duration,
}

impl AuthRateLimiter {
    pub fn from_env() -> Self {
        let max = std::env::var("AUTH_RATE_LIMIT_MAX")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(120);
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
            max,
            window: Duration::from_secs(15 * 60),
        }
    }

    pub async fn limit(&self, req: Request, next: Next) -> Response {
        let key = client_key(req.headers());
        let now = Instant::now();
        let blocked = {
            let mut map = self.buckets.lock().expect("rate limit lock");
            let entry = map.entry(key).or_insert((0, now));
            if now.duration_since(entry.1) > self.window {
                *entry = (0, now);
            }
            if entry.0 >= self.max {
                true
            } else {
                entry.0 += 1;
                false
            }
        };

        if blocked {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "rate_limit_exceeded",
                    "message": "Too many auth attempts. Try again later."
                })),
            )
                .into_response();
        }

        next.run(req).await
    }
}

fn client_key(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_120_requests() {
        let limiter = AuthRateLimiter::from_env();
        assert_eq!(limiter.max, 120);
    }
}
