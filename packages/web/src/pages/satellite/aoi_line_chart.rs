//! AOI multi-layer line chart — React `AoiStaticMultiLayerLineChart.tsx` (Task 32.10).

use dioxus::prelude::*;

use crate::gis::ChartLayerSeries;

#[component]
pub fn AoiLineChart(series: ChartLayerSeries) -> Element {
    let max = series
        .values
        .iter()
        .copied()
        .fold(0.0_f64, f64::max)
        .max(0.001);
    rsx! {
        div { class: "gs-native-aoi-line-chart",
            p { class: "gs-native-tool-panel__label", "{series.label}" }
            svg {
                class: "gs-native-aoi-line-chart__svg",
                view_box: "0 0 100 40",
                polyline {
                    points: "{polyline_points(&series.values, max)}",
                    fill: "none",
                    stroke: "#38bdf8",
                    stroke_width: "1.5",
                }
            }
        }
    }
}

fn polyline_points(values: &[f64], max: f64) -> String {
    if values.is_empty() {
        return String::new();
    }
    values
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let x = (i as f64 / (values.len() - 1).max(1) as f64) * 100.0;
            let y = 38.0 - (v / max) * 36.0;
            format!("{x:.1},{y:.1}")
        })
        .collect::<Vec<_>>()
        .join(" ")
}
