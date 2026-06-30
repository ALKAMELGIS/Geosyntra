//! Timeline options modal — React `SiTimelineOptionsModal.tsx` (Task 32.5d).

use dioxus::prelude::*;

use crate::gis::TimelineTransitionMode;

#[derive(Debug, Clone, PartialEq)]
pub struct TimelineOptions {
    pub transition: TimelineTransitionMode,
    pub playback_rate: f64,
    pub loop_playback: bool,
}

impl Default for TimelineOptions {
    fn default() -> Self {
        Self {
            transition: TimelineTransitionMode::Smooth,
            playback_rate: 1.0,
            loop_playback: true,
        }
    }
}

#[component]
pub fn TimelineOptionsModal(
    open: bool,
    options: Signal<TimelineOptions>,
    on_apply: EventHandler<TimelineOptions>,
    on_close: EventHandler<()>,
) -> Element {
    if !open {
        return rsx! {};
    }
    let o = options();
    rsx! {
        div { class: "gs-timeline-options-backdrop", onclick: move |_| on_close.call(()),
            div {
                class: "gs-timeline-options-modal",
                onclick: move |e| e.stop_propagation(),
                h3 { "Timeline options" }
                label {
                    "Transition"
                    select {
                        value: if matches!(o.transition, TimelineTransitionMode::Smooth) { "smooth" } else { "step" },
                        onchange: move |e| {
                            options.with_mut(|opt| {
                                opt.transition = if e.value() == "smooth" {
                                    TimelineTransitionMode::Smooth
                                } else {
                                    TimelineTransitionMode::Step
                                };
                            });
                        },
                        option { value: "smooth", "Smooth crossfade" }
                        option { value: "step", "Step" }
                    }
                }
                label {
                    "Playback rate {o.playback_rate:.1}x"
                    input {
                        r#type: "range",
                        min: "0.5",
                        max: "3",
                        step: "0.1",
                        value: "{o.playback_rate}",
                        oninput: move |e| {
                            if let Ok(v) = e.value().parse() {
                                options.with_mut(|opt| opt.playback_rate = v);
                            }
                        },
                    }
                }
                footer {
                    button {
                        class: "gs-native-tool-panel__btn",
                        r#type: "button",
                        onclick: move |_| on_apply.call(options()),
                        "Apply"
                    }
                    button {
                        class: "gs-native-tool-panel__btn gs-native-tool-panel__btn--ghost",
                        r#type: "button",
                        onclick: move |_| on_close.call(()),
                        "Cancel"
                    }
                }
            }
        }
    }
}
