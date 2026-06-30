//! Daylight arc slider panel — React `SiMapDaylightPanel.tsx` subset (Task 32.1a).

use dioxus::prelude::*;

use crate::gis::native::{
    clamp_minutes, format_date_display, minutes_to_hhmm, DaylightSettings, DAYLIGHT_MINUTES_MAX,
};

#[component]
pub fn DaylightPanel(
    settings: Signal<DaylightSettings>,
    on_change: EventHandler<DaylightSettings>,
) -> Element {
    let s = settings();
    let time_label = minutes_to_hhmm(s.minutes);
    let date_label = format_date_display(&s.date);

    rsx! {
        div { class: "gs-native-daylight-panel",
            p { class: "gs-native-tool-panel__hint",
                "Adjust sun position for 3D globe lighting (Mapbox light API)."
            }
            label { class: "gs-native-tool-panel__label",
                "Time of day: {time_label}"
                input {
                    r#type: "range",
                    min: "0",
                    max: "{DAYLIGHT_MINUTES_MAX}",
                    value: "{s.minutes}",
                    oninput: move |e| {
                        let Ok(v) = e.value().parse::<u16>() else { return };
                        let mut next = settings();
                        next.minutes = clamp_minutes(v);
                        on_change.call(next);
                    },
                }
            }
            label { class: "gs-native-tool-panel__label",
                "Date"
                input {
                    r#type: "date",
                    value: "{date_label}",
                    oninput: move |e| {
                        let mut next = settings();
                        next.date = e.value();
                        on_change.call(next);
                    },
                }
            }
            label { class: "gs-native-daylight-toggle",
                input {
                    r#type: "checkbox",
                    checked: s.sun_by_datetime,
                    onchange: move |e| {
                        let mut next = settings();
                        next.sun_by_datetime = e.checked();
                        on_change.call(next);
                    },
                }
                " Sun position by date & time"
            }
            div { class: "gs-native-daylight-presets",
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| {
                        let mut next = settings();
                        next.minutes = 360;
                        on_change.call(next);
                    },
                    "Dawn"
                }
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| {
                        let mut next = settings();
                        next.minutes = 720;
                        on_change.call(next);
                    },
                    "Noon"
                }
                button {
                    class: "gs-native-tool-panel__btn",
                    r#type: "button",
                    onclick: move |_| {
                        let mut next = settings();
                        next.minutes = 1080;
                        on_change.call(next);
                    },
                    "Dusk"
                }
            }
        }
    }
}
