//! Open-Meteo + OpenWeatherMap gateway weather client — Task 32.8.

use serde::{Deserialize, Serialize};

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WeatherSnapshot {
    pub temperature_c: f64,
    pub wind_speed_kmh: f64,
    pub wind_direction_deg: f64,
    pub weather_code: u16,
    pub summary: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoCurrent {
    #[serde(default)]
    temperature_2m: Option<f64>,
    #[serde(default)]
    wind_speed_10m: Option<f64>,
    #[serde(default)]
    wind_direction_10m: Option<f64>,
    #[serde(default)]
    weather_code: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    #[serde(default)]
    current: Option<OpenMeteoCurrent>,
}

#[derive(Debug, Deserialize)]
struct OwmMain {
    #[serde(default)]
    temp: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OwmWind {
    #[serde(default)]
    speed: Option<f64>,
    #[serde(default)]
    deg: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OwmWeatherEntry {
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OwmResponse {
    #[serde(default)]
    main: Option<OwmMain>,
    #[serde(default)]
    wind: Option<OwmWind>,
    #[serde(default)]
    weather: Option<Vec<OwmWeatherEntry>>,
}

pub fn open_meteo_forecast_url(lat: f64, lng: f64) -> String {
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code"
    )
}

fn wmo_label(code: u16) -> &'static str {
    match code {
        0 => "Clear",
        1 | 2 | 3 => "Partly cloudy",
        45 | 48 => "Fog",
        51..=67 => "Rain",
        71..=77 => "Snow",
        80..=82 => "Showers",
        95..=99 => "Thunderstorm",
        _ => "Cloudy",
    }
}

fn snapshot_from_open_meteo(lat: f64, lng: f64, body: OpenMeteoResponse) -> WeatherSnapshot {
    let cur = body.current.unwrap_or(OpenMeteoCurrent {
        temperature_2m: None,
        wind_speed_10m: None,
        wind_direction_10m: None,
        weather_code: None,
    });
    let temp = cur.temperature_2m.unwrap_or(20.0);
    let wind = cur.wind_speed_10m.unwrap_or(0.0);
    let dir = cur.wind_direction_10m.unwrap_or(0.0);
    let code = cur.weather_code.unwrap_or(2);
    let label = wmo_label(code);
    WeatherSnapshot {
        temperature_c: temp,
        wind_speed_kmh: wind,
        wind_direction_deg: dir,
        weather_code: code,
        summary: format!(
            "{label} · {:.0}°C · wind {:.0} km/h ({:.0}°)",
            temp, wind, dir
        ),
        provider: format!("open-meteo ({lat:.2},{lng:.2})"),
    }
}

fn snapshot_from_owm(body: OwmResponse) -> Option<WeatherSnapshot> {
    let temp = body.main.as_ref().and_then(|m| m.temp)?;
    let wind_ms = body.wind.as_ref().and_then(|w| w.speed).unwrap_or(0.0);
    let dir = body.wind.as_ref().and_then(|w| w.deg).unwrap_or(0.0);
    let desc = body
        .weather
        .as_ref()
        .and_then(|w| w.first())
        .and_then(|e| e.description.clone())
        .unwrap_or_else(|| "Weather".into());
    Some(WeatherSnapshot {
        temperature_c: temp,
        wind_speed_kmh: wind_ms * 3.6,
        wind_direction_deg: dir,
        weather_code: 0,
        summary: format!("{desc} · {:.0}°C · wind {:.0} km/h", temp, wind_ms * 3.6),
        provider: "openweathermap".into(),
    })
}

/// Fetch weather at a map point — OpenWeatherMap gateway when configured, else Open-Meteo (public).
pub async fn fetch_weather_at(
    lat: f64,
    lng: f64,
    token: Option<&str>,
) -> Result<WeatherSnapshot, ApiError> {
    if let Some(tok) = token {
        if let Ok(snap) = fetch_weather_via_gateway(lat, lng, tok).await {
            return Ok(snap);
        }
    }
    fetch_weather_open_meteo(lat, lng).await
}

async fn fetch_weather_via_gateway(
    lat: f64,
    lng: f64,
    token: &str,
) -> Result<WeatherSnapshot, ApiError> {
    let client = ApiClient::from_env();
    let path = format!(
        "/api/gateway/openweathermap/data/2.5/weather?lat={lat}&lon={lng}&units=metric"
    );
    let body: OwmResponse = client.get_json(&path, Some(token)).await?;
    snapshot_from_owm(body).ok_or_else(|| ApiError::Parse {
        message: "openweathermap response missing fields".into(),
    })
}

async fn fetch_weather_open_meteo(lat: f64, lng: f64) -> Result<WeatherSnapshot, ApiError> {
    let client = ApiClient::from_env();
    let url = open_meteo_forecast_url(lat, lng);
    let body: OpenMeteoResponse = client.get_json(&url, None).await?;
    Ok(snapshot_from_open_meteo(lat, lng, body))
}

/// @deprecated Use `fetch_weather_at` — kept for unit tests only.
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
        provider: "demo".into(),
    }
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
