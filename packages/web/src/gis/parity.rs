//! GIS parity tracker — Task 32 (percent complete per area vs React SI on `main`).

/// Parity area identifier (matches migration/dioxus-gis-parity-100-plan.md).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParityArea {
    pub id: &'static str,
    pub label: &'static str,
    pub percent: u8,
    pub task: &'static str,
}

/// Current parity snapshot — update when a Task 32.x subtask lands.
pub const PARITY_AREAS: &[ParityArea] = &[
    ParityArea {
        id: "map_shell",
        label: "Map shell / basemap / globe",
        percent: 40,
        task: "32.1",
    },
    ParityArea {
        id: "toolbox",
        label: "Toolbox UI shell",
        percent: 35,
        task: "32.2",
    },
    ParityArea {
        id: "layers",
        label: "Layers & add data",
        percent: 15,
        task: "32.3",
    },
    ParityArea {
        id: "remote_sensing",
        label: "Remote sensing / indices",
        percent: 38,
        task: "32.5",
    },
    ParityArea {
        id: "aoi",
        label: "AOI",
        percent: 42,
        task: "32.6",
    },
    ParityArea {
        id: "symbology",
        label: "Symbology",
        percent: 22,
        task: "32.4",
    },
    ParityArea {
        id: "routing",
        label: "Routing / VRP / loc-alloc",
        percent: 5,
        task: "32.7",
    },
    ParityArea {
        id: "weather",
        label: "Weather",
        percent: 10,
        task: "32.8",
    },
    ParityArea {
        id: "geo_ai",
        label: "Geo AI",
        percent: 15,
        task: "32.9",
    },
    ParityArea {
        id: "charts",
        label: "Charts / analytics",
        percent: 5,
        task: "32.10",
    },
    ParityArea {
        id: "print",
        label: "Print / export",
        percent: 20,
        task: "32.11",
    },
    ParityArea {
        id: "gis_content",
        label: "GIS Content settings",
        percent: 5,
        task: "32.12",
    },
    ParityArea {
        id: "backend_gis",
        label: "Backend GIS DB APIs",
        percent: 100,
        task: "32.0",
    },
];

pub fn weighted_overall_percent() -> u8 {
    if PARITY_AREAS.is_empty() {
        return 0;
    }
    let sum: u32 = PARITY_AREAS.iter().map(|a| u32::from(a.percent)).sum();
    (sum / PARITY_AREAS.len() as u32) as u8
}

pub fn area_percent(id: &str) -> Option<u8> {
    PARITY_AREAS
        .iter()
        .find(|a| a.id == id)
        .map(|a| a.percent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_gis_apis_at_100_after_task_32_0() {
        assert_eq!(area_percent("backend_gis"), Some(100));
    }

    #[test]
    fn remote_sensing_wms_builder_after_task_32_5a() {
        assert!(area_percent("remote_sensing").unwrap_or(0) >= 35);
    }

    #[test]
    fn symbology_engine_after_task_32_4b() {
        assert!(area_percent("symbology").unwrap_or(0) >= 20);
    }

    #[test]
    fn aoi_report_after_task_32_6d() {
        assert!(area_percent("aoi").unwrap_or(0) >= 40);
    }

    #[test]
    fn all_areas_tracked() {
        assert_eq!(PARITY_AREAS.len(), 13);
    }

    #[test]
    fn weighted_overall_increased_from_baseline() {
        let overall = weighted_overall_percent();
        assert!(overall >= 18, "expected >= 18%, got {overall}%");
        assert!(overall < 100, "full parity not yet complete");
    }
}
