//! Wall-clock milliseconds since Unix epoch.
//!
//! `std::time::SystemTime` panics on wasm32 (`time not implemented on this platform`).

/// Current UTC time in milliseconds since Unix epoch.
pub fn now_ms() -> i64 {
    #[cfg(all(feature = "web", target_arch = "wasm32"))]
    {
        js_sys::Date::now() as i64
    }

    #[cfg(not(all(feature = "web", target_arch = "wasm32")))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::now_ms;

    #[test]
    fn now_ms_is_recent_epoch() {
        // After 2020-01-01
        assert!(now_ms() > 1_577_836_800_000);
    }
}
