//! Token registry env keys — keep aligned with `interface::config::tokens::TOKEN_REGISTRY`.

pub struct TokenMeta {
    pub name: &'static str,
    pub label: &'static str,
    pub category: &'static str,
    pub env_only: bool,
    pub env_keys: &'static [&'static str],
}

pub const TOKEN_REGISTRY: &[TokenMeta] = &[
    TokenMeta {
        name: "mapbox",
        label: "Mapbox",
        category: "maps",
        env_only: true,
        env_keys: &["MAPBOX_TOKEN", "MAPBOX", "MAPBOX_ACCESS_TOKEN", "MAPBOX_PUBLIC_TOKEN"],
    },
    TokenMeta {
        name: "arcgis",
        label: "ArcGIS Portal",
        category: "gis",
        env_only: false,
        env_keys: &["ARCGIS_PORTAL_TOKEN"],
    },
    TokenMeta {
        name: "sentinelhub",
        label: "Sentinel Hub",
        category: "earth_observation",
        env_only: false,
        env_keys: &["SENTINEL_HUB_ACCESS_TOKEN", "SENTINEL_HUB_TOKEN", "SENTINEL"],
    },
    TokenMeta {
        name: "sentinelhub_wms",
        label: "Sentinel Hub WMS Instance",
        category: "earth_observation",
        env_only: false,
        env_keys: &["SENTINEL_HUB_WMS_INSTANCE_ID"],
    },
    TokenMeta {
        name: "openweathermap",
        label: "OpenWeatherMap",
        category: "weather",
        env_only: false,
        env_keys: &["OPENWEATHERMAP_API_KEY"],
    },
    TokenMeta {
        name: "gemini",
        label: "Google Gemini",
        category: "ai",
        env_only: false,
        env_keys: &["GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY"],
    },
    TokenMeta {
        name: "claude",
        label: "Anthropic Claude",
        category: "ai",
        env_only: false,
        env_keys: &["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    },
    TokenMeta {
        name: "openai",
        label: "OpenAI",
        category: "ai",
        env_only: false,
        env_keys: &["OPENAI_API_KEY"],
    },
    TokenMeta {
        name: "deepseek",
        label: "DeepSeek",
        category: "ai",
        env_only: false,
        env_keys: &["DEEPSEEK_API_KEY"],
    },
    TokenMeta {
        name: "openrouteservice",
        label: "OpenRouteService",
        category: "routing",
        env_only: false,
        env_keys: &["OPENROUTESERVICE_API_KEY", "ORS_API_KEY"],
    },
    TokenMeta {
        name: "graphhopper",
        label: "GraphHopper",
        category: "routing",
        env_only: false,
        env_keys: &["GRAPHHOPPER_API_KEY"],
    },
];

pub fn registry_entry(name: &str) -> Option<&'static TokenMeta> {
    TOKEN_REGISTRY.iter().find(|e| e.name == name)
}

pub fn env_value(keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|k| std::env::var(k).ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn env_configured(name: &str) -> bool {
    registry_entry(name)
        .map(|e| env_value(e.env_keys).is_some())
        .unwrap_or(false)
}

pub fn mask_value(value: &str) -> String {
    let v = value.trim();
    if v.is_empty() {
        return String::new();
    }
    if v.len() <= 8 {
        return "••••••••".into();
    }
    format!("{}••••{}", &v[..4], &v[v.len() - 4..])
}
