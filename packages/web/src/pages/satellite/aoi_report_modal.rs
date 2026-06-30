//! AOI vegetation report modal — React `SiAoiReportModal.tsx` subset (Task 32.6d).

use dioxus::prelude::*;

use crate::gis::AoiVegetationReport;

#[component]
pub fn AoiReportModal(
    open: bool,
    report: Option<AoiVegetationReport>,
    on_close: EventHandler<()>,
) -> Element {
    if !open {
        return rsx! {};
    }

    let Some(r) = report else {
        return rsx! {
            div { class: "gs-aoi-report-backdrop", onclick: move |_| on_close.call(()),
                div {
                    class: "gs-aoi-report-modal",
                    onclick: move |e| e.stop_propagation(),
                    p { "No report data — draw an AOI and try again." }
                    button {
                        class: "gs-native-tool-panel__btn",
                        r#type: "button",
                        onclick: move |_| on_close.call(()),
                        "Close"
                    }
                }
            }
        };
    };

    rsx! {
        div { class: "gs-aoi-report-backdrop", onclick: move |_| on_close.call(()),
            div {
                class: "gs-aoi-report-modal",
                onclick: move |e| e.stop_propagation(),
                header { class: "gs-aoi-report-modal__header",
                    h2 { "{r.aoi_name} — {r.index_label}" }
                    button {
                        class: "gs-aoi-report-modal__close",
                        r#type: "button",
                        aria_label: "Close report",
                        onclick: move |_| on_close.call(()),
                        "×"
                    }
                }
                section { class: "gs-aoi-report-modal__summary",
                    for line in r.summary_lines.iter() {
                        p { "{line}" }
                    }
                    p { "{r.analysis}" }
                }
                section { class: "gs-aoi-report-modal__metrics",
                    p { "Area: {r.aoi_area_km2:.2} km²" }
                    p { "Period: {r.date_start} → {r.date_end}" }
                    if let Some(last) = r.time_series.last() {
                        p { "Latest index ({last.date}): {last.value:.3}" }
                    }
                }
                section { class: "gs-aoi-report-modal__table",
                    h3 { "Classification bands" }
                    table {
                        thead {
                            tr {
                                th { "Class" }
                                th { "%" }
                                th { "Area km²" }
                            }
                        }
                        tbody {
                            for row in r.table_rows.iter() {
                                tr {
                                    td {
                                        span {
                                            class: "gs-aoi-report-swatch",
                                            style: "background: {row.color_hex}",
                                        }
                                        " {row.label}"
                                    }
                                    td { "{row.pct:.1}" }
                                    td { "{row.area_km2:.3}" }
                                }
                            }
                        }
                    }
                }
                section { class: "gs-aoi-report-modal__change-grid",
                    h3 { "Change detection (12 slots)" }
                    div { class: "gs-aoi-report-slots",
                        for slot in r.change_detection_slots.iter() {
                            div { class: "gs-aoi-report-slot",
                                span { class: "gs-aoi-report-slot__date", "{slot.date}" }
                                span { class: "gs-aoi-report-slot__mean", "{slot.index_mean:.2}" }
                            }
                        }
                    }
                }
                footer { class: "gs-aoi-report-modal__footer",
                    button {
                        class: "gs-native-tool-panel__btn",
                        r#type: "button",
                        onclick: move |_| on_close.call(()),
                        "Close"
                    }
                }
            }
        }
    }
}
