//! Esri basemap gallery — port of `SiBasemapWidget.tsx` (Task 29).

use dioxus::prelude::*;

use crate::gis::{
    basemap_thumbnail_url, build_basemap_catalog, catalog_entry_by_id, esri_basemap_entries,
    resolve_basemap_id, BasemapEntry, QUICK_BASEMAP_PRESETS,
};

#[component]
pub fn BasemapWidget(
    active_basemap_id: String,
    on_select: EventHandler<String>,
    on_close: EventHandler<()>,
) -> Element {
    let catalog = build_basemap_catalog();
    let raster_entries = esri_basemap_entries(&catalog);

    rsx! {
        div {
            class: "si-basemap-widget si-basemap-widget--esri si-basemap-widget--dropdown",
            role: "listbox",
            aria_label: "Basemap gallery",

            div { class: "si-basemap-widget__header",
                span { class: "si-basemap-widget__title", "Basemap" }
                button {
                    class: "si-basemap-widget__close",
                    r#type: "button",
                    aria_label: "Close basemap gallery",
                    onclick: move |_| on_close.call(()),
                    "×"
                }
            }

            div { class: "si-basemap-widget__body",
                div {
                    class: "si-basemap-quick",
                    role: "group",
                    aria_label: "Quick basemaps",
                    for preset in QUICK_BASEMAP_PRESETS.iter() {
                        {
                            let resolved = resolve_basemap_id(preset.catalog_id);
                            let active = active_basemap_id == preset.catalog_id
                                || active_basemap_id == resolved;
                            let catalog_id = preset.catalog_id.to_string();
                            rsx! {
                                button {
                                    key: "{preset.key}",
                                    class: if active {
                                        "si-basemap-quick-btn si-basemap-quick-btn--active"
                                    } else {
                                        "si-basemap-quick-btn"
                                    },
                                    r#type: "button",
                                    title: "{preset.label}",
                                    aria_label: "{preset.label}",
                                    aria_pressed: "{active}",
                                    onclick: move |_| on_select.call(catalog_id.clone()),
                                    "{quick_preset_glyph(preset.key)}"
                                }
                            }
                        }
                    }
                }

                div { class: "si-basemap-section si-basemap-section--flat",
                    div { class: "si-basemap-section__label", "All basemaps" }
                    div { class: "si-basemap-section__list",
                        for entry in raster_entries.iter() {
                            BasemapRow {
                                key: "{entry.id}",
                                entry: entry.clone(),
                                active: active_basemap_id == entry.id,
                                on_select: move |id| on_select.call(id),
                            }
                        }
                    }
                }
            }
        }
    }
}

fn quick_preset_glyph(key: &str) -> &'static str {
    match key {
        "esri" => "🌐",
        "esri-imagery-hybrid" => "⧉",
        "streets" => "🗺",
        "dark" => "🌙",
        "topographic" => "⛰",
        _ => "◉",
    }
}

#[component]
fn BasemapRow(entry: BasemapEntry, active: bool, on_select: EventHandler<String>) -> Element {
    let thumb = basemap_thumbnail_url(&entry);
    let hybrid = entry.id == "esri-imagery-hybrid";
    let entry_id = entry.id.clone();
    let label = entry.label.clone();

    rsx! {
        button {
            class: if active {
                "si-basemap-row si-basemap-row--active"
            } else {
                "si-basemap-row"
            },
            r#type: "button",
            role: "option",
            aria_selected: "{active}",
            title: "{label}",
            onclick: move |_| on_select.call(entry_id.clone()),
            span { class: "si-basemap-row__thumb",
                img { src: "{thumb}", alt: "", loading: "lazy" }
                if hybrid {
                    span { class: "si-basemap-row__hybrid", "Labels" }
                }
            }
            span { class: "si-basemap-row__meta",
                span { class: "si-basemap-row__label", "{label}" }
                if !entry.badges.is_empty() {
                    span { class: "si-basemap-row__badges",
                        for badge in entry.badges.iter() {
                            span { class: "si-basemap-row__badge", key: "{badge}", "{badge}" }
                        }
                    }
                }
            }
        }
    }
}

/// Active basemap label for the map toolbar button.
pub fn active_basemap_label(active_id: &str) -> String {
    let catalog = build_basemap_catalog();
    let resolved = resolve_basemap_id(active_id);
    catalog_entry_by_id(&catalog, &resolved)
        .or_else(|| catalog_entry_by_id(&catalog, active_id))
        .map(|e| e.label.clone())
        .unwrap_or_else(|| "Basemap".into())
}
