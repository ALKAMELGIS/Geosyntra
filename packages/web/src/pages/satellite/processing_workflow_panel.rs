//! Smart processing workflow — React `SmartProcessingWorkflowPanel.tsx` (Task 32.2b).

use dioxus::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessingStep {
    SelectAoi,
    PickIndex,
    SetDates,
    GenerateTimeline,
    ReviewCharts,
}

#[component]
pub fn ProcessingWorkflowPanel(
    step: Signal<ProcessingStep>,
    on_advance: EventHandler<()>,
) -> Element {
    let label = match step() {
        ProcessingStep::SelectAoi => "1. Draw or select an AOI",
        ProcessingStep::PickIndex => "2. Choose spectral index",
        ProcessingStep::SetDates => "3. Set date range",
        ProcessingStep::GenerateTimeline => "4. Generate timeline",
        ProcessingStep::ReviewCharts => "5. Review charts & report",
    };
    rsx! {
        div { class: "gs-native-processing-workflow",
            p { class: "gs-native-tool-panel__label", "Processing workflow" }
            p { "{label}" }
            button {
                class: "gs-native-tool-panel__btn",
                r#type: "button",
                onclick: move |_| on_advance.call(()),
                "Next step"
            }
        }
    }
}
