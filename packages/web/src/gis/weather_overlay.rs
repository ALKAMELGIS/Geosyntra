//! On-map weather overlay paint (Task 32.FD-7).

use serde_json::{json, Value};

use crate::api::gis::open_meteo::WeatherSnapshot;

pub const WEATHER_OVERLAY_LAYER_ID: &str = "weather-overlay";

pub fn weather_point_geojson(lat: f64, lng: f64, snapshot: &WeatherSnapshot) -> Value {
    json!({
        "type": "Feature",
        "geometry": { "type": "Point", "coordinates": [lng, lat] },
        "properties": {
            "temperature_c": snapshot.temperature_c,
            "wind_kmh": snapshot.wind_speed_kmh,
            "summary": snapshot.summary,
        }
    })
}

pub fn weather_overlay_paint() -> Value {
    json!({
        "circle-color": "#38bdf8",
        "circle-radius": 14,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0ea5e9",
        "circle-opacity": 0.75
    })
}
