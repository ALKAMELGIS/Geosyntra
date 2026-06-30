//! Routing / VRP / loc-alloc (Task 32.7).

mod loc_alloc;
mod vrp;

pub use loc_alloc::{
    haversine_km as la_haversine_km, solve_location_allocation, LaAssignment, LaDemand,
    LaFacility,
};
pub use vrp::{solve_vrp_greedy, VrpRoute, VrpStop};
