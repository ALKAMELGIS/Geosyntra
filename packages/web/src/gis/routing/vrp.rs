//! VRP engine — React `siVrpEngine.ts` subset (Task 32.7).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VrpStop {
    pub id: String,
    pub lng: f64,
    pub lat: f64,
    pub demand: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VrpRoute {
    pub vehicle_id: String,
    pub stop_ids: Vec<String>,
    pub total_cost: f64,
}

pub fn solve_vrp_greedy(stops: &[VrpStop], vehicle_count: usize) -> Vec<VrpRoute> {
    if stops.is_empty() || vehicle_count == 0 {
        return Vec::new();
    }
    let per_vehicle = (stops.len() + vehicle_count - 1) / vehicle_count;
    stops
        .chunks(per_vehicle.max(1))
        .enumerate()
        .map(|(i, chunk)| {
            let ids: Vec<String> = chunk.iter().map(|s| s.id.clone()).collect();
            let cost = chunk.iter().map(|s| s.demand).sum();
            VrpRoute {
                vehicle_id: format!("vehicle-{i}"),
                stop_ids: ids,
                total_cost: cost,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_stops_across_vehicles() {
        let stops: Vec<_> = (0..4)
            .map(|i| VrpStop {
                id: format!("s{i}"),
                lng: 0.0,
                lat: 0.0,
                demand: 1.0,
            })
            .collect();
        let routes = solve_vrp_greedy(&stops, 2);
        assert_eq!(routes.len(), 2);
    }
}
