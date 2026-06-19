//! Esri-first basemap catalog for native Mapbox GL workspace (Task 31.1).
//!
//! **Mapbox GL** is the WebGL engine; **tiles** come from Esri/OSM/Carto (same model as React SI).
//! React reference: `basemapCatalog.ts`, `DEFAULT_BASEMAP_ID = 'esri'`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Startup default — Esri World Imagery (React `DEFAULT_BASEMAP_ID_NO_MAPBOX`).
pub const DEFAULT_BASEMAP_ID: &str = "esri";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BasemapPreset {
    pub id: &'static str,
    pub label: &'static str,
}

/// Quick chips aligned with React `SI_QUICK_BASEMAP_PRESETS` (subset for Phase 1).
pub const QUICK_PRESETS: &[BasemapPreset] = &[
    BasemapPreset {
        id: "esri",
        label: "Imagery",
    },
    BasemapPreset {
        id: "esri-imagery-hybrid",
        label: "Hybrid",
    },
    BasemapPreset {
        id: "esri-streets",
        label: "Streets",
    },
    BasemapPreset {
        id: "esri-dark-gray",
        label: "Dark",
    },
    BasemapPreset {
        id: "esri-topo",
        label: "Topo",
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BasemapEntry {
    pub id: String,
    pub label: String,
}

fn esri_tile(service: &str) -> String {
    format!(
        "https://server.arcgisonline.com/ArcGIS/rest/services/{service}/MapServer/tile/{{z}}/{{y}}/{{x}}"
    )
}

fn raster_style(layers: &[(&str, &str)]) -> Value {
    let mut sources = serde_json::Map::new();
    let mut map_layers = Vec::new();

    for (i, (url, attribution)) in layers.iter().enumerate() {
        let sid = format!("r{i}");
        sources.insert(
            sid.clone(),
            json!({
                "type": "raster",
                "tiles": [url],
                "tileSize": 256,
                "attribution": attribution,
            }),
        );
        map_layers.push(json!({
            "id": format!("layer-{i}"),
            "type": "raster",
            "source": sid,
        }));
    }

    json!({
        "version": 8,
        "glyphs": "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        "sources": sources,
        "layers": map_layers,
    })
}

pub fn catalog_entries() -> Vec<BasemapEntry> {
    vec![
        BasemapEntry {
            id: "esri".into(),
            label: "Esri World Imagery".into(),
        },
        BasemapEntry {
            id: "esri-imagery-hybrid".into(),
            label: "Esri Imagery Hybrid".into(),
        },
        BasemapEntry {
            id: "esri-streets".into(),
            label: "Esri World Street Map".into(),
        },
        BasemapEntry {
            id: "esri-dark-gray".into(),
            label: "Esri Dark Gray Canvas".into(),
        },
        BasemapEntry {
            id: "esri-topo".into(),
            label: "Esri World Topo".into(),
        },
        BasemapEntry {
            id: "osm".into(),
            label: "OpenStreetMap".into(),
        },
    ]
}

pub fn style_for_basemap(id: &str) -> Value {
    match resolve_basemap_id(id) {
        "esri-imagery-hybrid" => raster_style(&[
            (&esri_tile("World_Imagery"), "Tiles © Esri"),
            (
                &esri_tile("Reference/World_Boundaries_and_Places"),
                "Tiles © Esri",
            ),
        ]),
        "esri-streets" => raster_style(&[(
            &esri_tile("World_Street_Map"),
            "Tiles © Esri",
        )]),
        "esri-dark-gray" => raster_style(&[
            (&esri_tile("Canvas/World_Dark_Gray_Base"), "Tiles © Esri"),
            (
                &esri_tile("Canvas/World_Dark_Gray_Reference"),
                "Tiles © Esri",
            ),
        ]),
        "esri-topo" => raster_style(&[(
            &esri_tile("World_Topo_Map"),
            "Tiles © Esri",
        )]),
        "osm" => raster_style(&[(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "© OpenStreetMap contributors",
        )]),
        _ => raster_style(&[(
            &esri_tile("World_Imagery"),
            "Tiles © Esri",
        )]),
    }
}

pub fn resolve_basemap_id(id: &str) -> &str {
    match id.trim().to_lowercase().as_str() {
        "esri" | "esri-imagery" | "satellite" => "esri",
        "esri-imagery-hybrid" | "hybrid" => "esri-imagery-hybrid",
        "esri-streets" | "streets" => "esri-streets",
        "esri-dark-gray" | "dark" | "carto-dark" => "esri-dark-gray",
        "esri-topo" | "topo" => "esri-topo",
        "osm" => "osm",
        _ => DEFAULT_BASEMAP_ID,
    }
}
