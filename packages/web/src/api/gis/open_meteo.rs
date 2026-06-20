//! Open-Meteo weather client — Task 32.8.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeatherSnapshot {
    pub temperature_c: f64,
    pub wind_speed_kmh: f64,
    pub wind_direction_deg: f64,
    pub weather_code: u16,
    pub summary: String,
}

pub fn demo_weather_at(lat: f64, lng: f64) -> WeatherSnapshot {
    let temp = 22.0 + (lat.abs() % 12.0) - 6.0;
    WeatherSnapshot {
        temperature_c: temp,
        wind_speed_kmh: 12.0 + (lng.abs() % 8.0),
        wind_direction_deg: 45.0,
        weather_code: 2,
        summary: format!(
            "Partly cloudy · {:.0}°C · wind {:.0} km/h NE",
            temp,
            12.0 + (lng.abs() % 8.0)
        ),
    }
}

pub fn open_meteo_forecast_url(lat: f64, lng: f64) -> String {
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current=temperature_2m,wind_speed_10m,weather_code"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forecast_url_includes_coords() {
        let url = open_meteo_forecast_url(22.0, 53.0);
        assert!(url.contains("latitude=22"));
    }
}
