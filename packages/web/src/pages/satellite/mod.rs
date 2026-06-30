//! GeoAI satellite workspace — native Mapbox GIS (Task 31).

mod aoi_line_chart;
mod aoi_report_modal;
mod basemap_picker;
mod contextual_dock;
mod daylight_panel;
mod dock_panel;
mod extended_panels;
mod feature_popup;
mod floating_drag;
mod layer_control_mount;
mod layer_swipe_panel;
mod map_brand;
mod map_floating_controls;
mod map_search;
mod map_shell;
mod map_status_bar;
mod map_token_banner;
mod map_workspace;
mod multidimensional;
mod native_workspace;
mod print_modal;
mod processing_workflow_panel;
mod quick_dashboard_panel;
mod remote_sensing_panel;
mod stac_explore_panel;
mod symbology_panel;
mod timeline_options_modal;
mod tool_panel;
mod toolbox_rail;
mod upload_panel;
mod weather_intel_panel;

pub use map_workspace::{Satellite, SatelliteIndices};
pub use multidimensional::Multidimensional;
