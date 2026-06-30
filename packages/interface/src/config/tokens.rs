//! Platform token env resolution — mirrors Express `tokenRegistry.js` / `env.js` (env-only).

use serde_json::{json, Value};

use crate::env_config;

pub struct TokenRegistryEntry {
    pub name: &'static str,
    pub label: &'static str,
    pub category: &'static str,
    pub env_only: bool,
    pub env_keys: &'static [&'static str],
}

pub const TOKEN_REGISTRY: &[TokenRegistryEntry] = &[
    TokenRegistryEntry {
        name: "mapbox",
        label: "Mapbox",
        category: "maps",
        env_only: true,
        env_keys: &["MAPBOX_TOKEN", "MAPBOX", "MAPBOX_ACCESS_TOKEN", "MAPBOX_PUBLIC_TOKEN"],
    },
    TokenRegistryEntry {
        name: "arcgis",
        label: "ArcGIS Portal",
        category: "gis",
        env_only: false,
        env_keys: &["ARCGIS_PORTAL_TOKEN"],
    },
    TokenRegistryEntry {
        name: "sentinelhub",
        label: "Sentinel Hub",
        category: "earth_observation",
        env_only: false,
        env_keys: &["SENTINEL_HUB_ACCESS_TOKEN", "SENTINEL_HUB_TOKEN", "SENTINEL"],
    },
    TokenRegistryEntry {
        name: "sentinelhub_wms",
        label: "Sentinel Hub WMS Instance",
        category: "earth_observation",
        env_only: false,
        env_keys: &["SENTINEL_HUB_WMS_INSTANCE_ID"],
    },
    TokenRegistryEntry {
        name: "openweathermap",
        label: "OpenWeatherMap",
        category: "weather",
        env_only: false,
        env_keys: &["OPENWEATHERMAP_API_KEY"],
    },
    TokenRegistryEntry {
        name: "gemini",
        label: "Google Gemini",
        category: "ai",
        env_only: false,
        env_keys: &["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"],
    },
    TokenRegistryEntry {
        name: "claude",
        label: "Anthropic Claude",
        category: "ai",
        env_only: false,
        env_keys: &["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    },
    TokenRegistryEntry {
        name: "openai",
        label: "OpenAI",
        category: "ai",
        env_only: false,
        env_keys: &["OPENAI_API_KEY"],
    },
    TokenRegistryEntry {
        name: "deepseek",
        label: "DeepSeek",
        category: "ai",
        env_only: false,
        env_keys: &["DEEPSEEK_API_KEY"],
    },
    TokenRegistryEntry {
        name: "openrouteservice",
        label: "OpenRouteService",
        category: "routing",
        env_only: false,
        env_keys: &["OPENROUTESERVICE_API_KEY", "ORS_API_KEY"],
    },
    TokenRegistryEntry {
        name: "graphhopper",
        label: "GraphHopper",
        category: "routing",
        env_only: false,
        env_keys: &["GRAPHHOPPER_API_KEY"],
    },
];

const TOKEN_ENV_KEYS: &[(&str, &[&str])] = &[
    ("mapbox", &["MAPBOX_TOKEN", "MAPBOX", "MAPBOX_ACCESS_TOKEN", "MAPBOX_PUBLIC_TOKEN"]),
    ("arcgis", &["ARCGIS_PORTAL_TOKEN"]),
    ("sentinelhub", &["SENTINEL_HUB_ACCESS_TOKEN", "SENTINEL_HUB_TOKEN", "SENTINEL"]),
    (
        "sentinelhub_wms",
        &["SENTINEL_HUB_WMS_INSTANCE_ID"],
    ),
    ("openweathermap", &["OPENWEATHERMAP_API_KEY"]),
    ("gemini", &["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"]),
    ("claude", &["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]),
    ("openai", &["OPENAI_API_KEY"]),
    ("deepseek", &["DEEPSEEK_API_KEY"]),
    (
        "openrouteservice",
        &["OPENROUTESERVICE_API_KEY", "ORS_API_KEY"],
    ),
    ("graphhopper", &["GRAPHHOPPER_API_KEY"]),
];

pub fn registry_entry(name: &str) -> Option<&'static TokenRegistryEntry> {
    TOKEN_REGISTRY.iter().find(|e| e.name == name)
}

pub fn token_configured(name: &str) -> bool {
    TOKEN_ENV_KEYS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, keys)| keys.iter().any(|k| env_config::env_non_empty(k)))
        .unwrap_or(false)
}

pub fn mapbox_public_token() -> Option<String> {
    let dedicated = env_config::trim_env_public("MAPBOX_PUBLIC_TOKEN")?;
    if dedicated.starts_with("pk.") {
        return Some(dedicated);
    }
    TOKEN_ENV_KEYS
        .iter()
        .find(|(n, _)| *n == "mapbox")
        .and_then(|(_, keys)| {
            keys.iter()
                .find_map(|k| env_config::trim_env_public(k))
                .filter(|v| v.starts_with("pk."))
        })
}

pub fn build_platform_capabilities() -> Value {
    let mut providers = serde_json::Map::new();
    for (name, keys) in TOKEN_ENV_KEYS {
        let configured = keys.iter().any(|k| env_config::env_non_empty(k));
        providers.insert(
            (*name).into(),
            json!({
                "label": name,
                "category": "platform",
                "configured": configured,
                "active": true,
                "legacyBuiltin": null,
                "source": if configured { "environment" } else { "none" },
            }),
        );
    }

    json!({
        "version": 1,
        "providers": providers,
        "gemini": token_configured("gemini"),
        "openai": token_configured("openai"),
        "claude": token_configured("claude"),
        "deepseek": token_configured("deepseek"),
        "mapbox": token_configured("mapbox"),
        "arcgis": token_configured("arcgis"),
        "sentinelhub": token_configured("sentinelhub") || token_configured("sentinelhub_wms"),
        "openrouteservice": token_configured("openrouteservice"),
        "graphhopper": token_configured("graphhopper"),
        "openweathermap": token_configured("openweathermap"),
    })
}

pub fn audit_environment_bindings() -> Value {
    let rows: Vec<Value> = TOKEN_ENV_KEYS
        .iter()
        .map(|(name, keys)| {
            let hit = keys.iter().find(|k| env_config::env_non_empty(k));
            json!({
                "name": name,
                "configured": hit.is_some(),
                "envKey": hit.unwrap_or(&keys[0]),
                "requiredInProduction": matches!(*name, "gemini"),
            })
        })
        .collect();
    Value::Array(rows)
}
