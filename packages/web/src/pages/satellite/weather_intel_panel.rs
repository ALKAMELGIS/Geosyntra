//! Weather intelligence panel — React `SiMapWeatherIntelPopup.tsx` (Task 32.8).

use dioxus::prelude::*;

use crate::api::gis::open_meteo::WeatherSnapshot;

#[component]
pub fn WeatherIntelPanel(
    snapshot: Option<WeatherSnapshot>,
    lat: Option<f64>,
    lng: Option<f64>,
) -> Element {
    rsx! {
        div { class: "gs-native-weather-intel",
            p { class: "gs-native-tool-panel__label", "Weather intelligence" }
            if let (Some(lat), Some(lng)) = (lat, lng) {
                p { class: "gs-native-tool-panel__meta", "Location: {lat:.4}, {lng:.4}" }
            }
            if let Some(s) = snapshot {
                p { "{s.summary}" }
                p { "Wind: {s.wind_speed_kmh:.0} km/h @ {s.wind_direction_deg:.0}°" }
            } else {
                p { class: "gs-native-tool-panel__empty",
                    "Move the map pointer to sample Open-Meteo conditions."
                }
            }
        }
    }
}
