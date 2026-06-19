//! Bottom-left map status — WGS 84 + pointer coords (React `SiMapWgs84CoordinateStatus`).

use dioxus::prelude::*;

#[derive(Debug, Clone, PartialEq)]
pub struct MapPointer {
    pub lng: f64,
    pub lat: f64,
}

pub fn format_wgs84_coord(lng: f64, lat: f64) -> String {
    let lat_hem = if lat >= 0.0 { 'N' } else { 'S' };
    let lng_hem = if lng >= 0.0 { 'E' } else { 'W' };
    format!(
        "{:.5}°{lat_hem}, {:.5}°{lng_hem}",
        lat.abs(),
        lng.abs()
    )
}

#[component]
pub fn MapStatusBar(
    pointer: Option<MapPointer>,
    projection_label: String,
    on_zoom_in: EventHandler<()>,
    on_zoom_out: EventHandler<()>,
    on_go_home: EventHandler<()>,
) -> Element {
    let coords = pointer
        .as_ref()
        .map(|p| format_wgs84_coord(p.lng, p.lat))
        .unwrap_or_else(|| "—".to_string());

    rsx! {
        div { class: "gs-native-status-bar",
            div { class: "gs-native-status-bar__zoom",
                button {
                    class: "gs-native-status-bar__zoom-btn",
                    r#type: "button",
                    title: "Zoom in",
                    aria_label: "Zoom in",
                    onclick: move |_| on_zoom_in.call(()),
                    i { class: "fa-solid fa-plus", aria_hidden: "true" }
                }
                button {
                    class: "gs-native-status-bar__zoom-btn",
                    r#type: "button",
                    title: "Zoom out",
                    aria_label: "Zoom out",
                    onclick: move |_| on_zoom_out.call(()),
                    i { class: "fa-solid fa-minus", aria_hidden: "true" }
                }
                button {
                    class: "gs-native-status-bar__zoom-btn",
                    r#type: "button",
                    title: "Globe home view",
                    aria_label: "Globe home view",
                    onclick: move |_| on_go_home.call(()),
                    i { class: "fa-solid fa-earth-americas", aria_hidden: "true" }
                }
            }

            div {
                class: "gs-native-status-bar__readout",
                role: "status",
                aria_label: "Map coordinates WGS 84",
                span { class: "gs-native-status-bar__crs", "WGS 84" }
                span { class: "gs-native-status-bar__epsg", "EPSG:4326" }
                span { class: "gs-native-status-bar__mode", "{projection_label}" }
                span { class: "gs-native-status-bar__coords", "{coords}" }
            }
        }
    }
}
