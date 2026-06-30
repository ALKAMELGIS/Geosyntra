//! Map daylight / sun position — React `siMapDaylight.ts` subset (Task 32.1a).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const DAYLIGHT_MINUTES_MAX: u16 = 1439;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DaylightSettings {
    #[serde(default = "default_minutes")]
    pub minutes: u16,
    #[serde(default = "default_date")]
    pub date: String,
    #[serde(default)]
    pub sun_by_datetime: bool,
    #[serde(default)]
    pub time_playing: bool,
}

fn default_minutes() -> u16 {
    720
}

fn default_date() -> String {
    crate::gis::iso_today()
}

impl Default for DaylightSettings {
    fn default() -> Self {
        Self {
            minutes: default_minutes(),
            date: default_date(),
            sun_by_datetime: true,
            time_playing: false,
        }
    }
}

pub fn clamp_minutes(m: u16) -> u16 {
    m.min(DAYLIGHT_MINUTES_MAX)
}

pub fn minutes_to_hhmm(minutes: u16) -> String {
    let m = clamp_minutes(minutes);
    format!("{:02}:{:02}", m / 60, m % 60)
}

pub fn format_date_display(iso: &str) -> String {
    iso.trim().chars().take(10).collect()
}

/// Mapbox GL light spec from minutes-of-day (0 = midnight).
pub fn mapbox_light_for_minutes(minutes: u16) -> Value {
    let m = clamp_minutes(minutes) as f64;
    let hour_angle = (m / DAYLIGHT_MINUTES_MAX as f64) * std::f64::consts::PI * 2.0 - std::f64::consts::FRAC_PI_2;
    let azimuth = hour_angle.to_degrees().rem_euclid(360.0);
    let elevation = (hour_angle.sin() * 60.0).max(-10.0);
    json!({
        "anchor": "map",
        "color": "#ffffff",
        "intensity": if elevation > 0.0 { 0.85 } else { 0.35 },
        "position": [1.15, azimuth, 90.0 - elevation]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn noon_has_high_elevation() {
        let light = mapbox_light_for_minutes(720);
        let pos = light.get("position").and_then(|v| v.as_array()).unwrap();
        assert!(pos.len() >= 3);
    }

    #[test]
    fn clamp_minutes_caps_at_max() {
        assert_eq!(clamp_minutes(2000), DAYLIGHT_MINUTES_MAX);
    }
}
