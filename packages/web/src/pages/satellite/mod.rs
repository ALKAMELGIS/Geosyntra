//! GeoAI satellite workspace — native Mapbox GIS (Task 31).

mod basemap_picker;
mod extended_panels;
mod map_floating_controls;
mod map_search;
mod map_shell;
mod map_status_bar;
mod map_workspace;
mod multidimensional;
mod native_workspace;
mod floating_drag;
mod layer_swipe_panel;
mod remote_sensing_panel;
mod tool_panel;
mod toolbox_rail;

pub use map_workspace::{Satellite, SatelliteIndices};
pub use multidimensional::Multidimensional;
