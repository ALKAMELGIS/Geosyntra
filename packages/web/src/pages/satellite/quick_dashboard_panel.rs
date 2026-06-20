//! Quick dashboard — React `SiQuickDashboardPanel.tsx` (Task 32.10).

use dioxus::prelude::*;

use crate::gis::{build_multi_layer_chart, sparkline_norm, WeeklyCompositeStat};

#[component]
pub fn QuickDashboardPanel(stats: Signal<Vec<WeeklyCompositeStat>>, index_id: String) -> Element {
    let series = build_multi_layer_chart(&index_id, &stats());
    let spark = sparkline_norm(&series.values);
    rsx! {
        div { class: "gs-native-quick-dashboard",
            p { class: "gs-native-tool-panel__label", "Quick Dashboard — {index_id}" }
            if series.values.is_empty() {
                p { class: "gs-native-tool-panel__empty", "Generate a timeline to populate KPIs." }
            } else {
                p { "Mean: {series.values.last().unwrap_or(&0.0):.3}" }
                div { class: "gs-native-sparkline",
                    for (i, v) in spark.iter().enumerate() {
                        div {
                            key: "{i}",
                            class: "gs-native-sparkline__bar",
                            style: "height: {(v * 100.0):.0}%",
                        }
                    }
                }
            }
        }
    }
}
