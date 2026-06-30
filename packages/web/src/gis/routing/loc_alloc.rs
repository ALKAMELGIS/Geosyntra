//! Location-allocation — React `siLocationAllocationEngine.ts` subset (Task 32.7).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LaFacility {
    pub id: String,
    pub lng: f64,
    pub lat: f64,
    pub capacity: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LaDemand {
    pub id: String,
    pub lng: f64,
    pub lat: f64,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LaAssignment {
    pub demand_id: String,
    pub facility_id: String,
    pub distance_km: f64,
}

pub fn haversine_km(a: (f64, f64), b: (f64, f64)) -> f64 {
    crate::gis::native::haversine_km(a.0, a.1, b.0, b.1)
}

pub fn solve_location_allocation(
    facilities: &[LaFacility],
    demands: &[LaDemand],
) -> Vec<LaAssignment> {
    demands
        .iter()
        .filter_map(|d| {
            let best = facilities.iter().min_by(|a, b| {
                let da = haversine_km((d.lng, d.lat), (a.lng, a.lat));
                let db = haversine_km((d.lng, d.lat), (b.lng, b.lat));
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })?;
            Some(LaAssignment {
                demand_id: d.id.clone(),
                facility_id: best.id.clone(),
                distance_km: haversine_km((d.lng, d.lat), (best.lng, best.lat)),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assigns_to_nearest_facility() {
        let facilities = vec![
            LaFacility {
                id: "f1".into(),
                lng: 0.0,
                lat: 0.0,
                capacity: 10.0,
            },
            LaFacility {
                id: "f2".into(),
                lng: 10.0,
                lat: 10.0,
                capacity: 10.0,
            },
        ];
        let demands = vec![LaDemand {
            id: "d1".into(),
            lng: 0.1,
            lat: 0.1,
            weight: 1.0,
        }];
        let a = solve_location_allocation(&facilities, &demands);
        assert_eq!(a[0].facility_id, "f1");
    }
}
