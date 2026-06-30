//! GIS parity tracker — Task 32 checklist + Task 32.FD functional depth.

/// Parity area — checklist (UI) vs functional (live behavior).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParityArea {
    pub id: &'static str,
    pub label: &'static str,
    /// UI deliverable complete (panels, routes, wiring).
    pub checklist_percent: u8,
    /// Live behavior vs React SI (see migration/dioxus-gis-functional-depth-100-plan.md).
    pub functional_percent: u8,
    pub task: &'static str,
}

/// Checklist + functional depth snapshot — Task 32.FD complete.
pub const PARITY_AREAS: &[ParityArea] = &[
    ParityArea {
        id: "map_shell",
        label: "Map shell / basemap / globe",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.1",
    },
    ParityArea {
        id: "toolbox",
        label: "Toolbox UI shell",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.2",
    },
    ParityArea {
        id: "layers",
        label: "Layers & add data",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.3",
    },
    ParityArea {
        id: "remote_sensing",
        label: "Remote sensing / indices",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.5",
    },
    ParityArea {
        id: "aoi",
        label: "AOI",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.6",
    },
    ParityArea {
        id: "symbology",
        label: "Symbology",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.4",
    },
    ParityArea {
        id: "routing",
        label: "Routing / VRP / loc-alloc",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.7",
    },
    ParityArea {
        id: "weather",
        label: "Weather",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.8",
    },
    ParityArea {
        id: "geo_ai",
        label: "Geo AI",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.9",
    },
    ParityArea {
        id: "charts",
        label: "Charts / analytics",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.10",
    },
    ParityArea {
        id: "print",
        label: "Print / export",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.11",
    },
    ParityArea {
        id: "gis_content",
        label: "GIS Content settings",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.12",
    },
    ParityArea {
        id: "backend_gis",
        label: "Backend GIS DB APIs",
        checklist_percent: 100,
        functional_percent: 100,
        task: "32.0",
    },
];

pub fn weighted_checklist_percent() -> u8 {
    weighted_percent(|a| a.checklist_percent)
}

pub fn weighted_functional_percent() -> u8 {
    weighted_percent(|a| a.functional_percent)
}

fn weighted_percent(f: fn(&ParityArea) -> u8) -> u8 {
    if PARITY_AREAS.is_empty() {
        return 0;
    }
    let sum: u32 = PARITY_AREAS.iter().map(|a| u32::from(f(a))).sum();
    (sum / PARITY_AREAS.len() as u32) as u8
}

pub fn area_functional_percent(id: &str) -> Option<u8> {
    PARITY_AREAS
        .iter()
        .find(|a| a.id == id)
        .map(|a| a.functional_percent)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checklist_all_at_100() {
        for area in PARITY_AREAS {
            assert_eq!(
                area.checklist_percent, 100,
                "checklist {} should be 100%",
                area.id
            );
        }
    }

    #[test]
    fn all_areas_tracked() {
        assert_eq!(PARITY_AREAS.len(), 13);
    }

    #[test]
    fn functional_depth_100_complete() {
        assert_eq!(weighted_functional_percent(), 100);
        for area in PARITY_AREAS {
            assert_eq!(
                area.functional_percent, 100,
                "functional {} should be 100%",
                area.id
            );
        }
    }

    #[test]
    fn backend_gis_functional_tracked() {
        assert_eq!(area_functional_percent("backend_gis"), Some(100));
    }
}
