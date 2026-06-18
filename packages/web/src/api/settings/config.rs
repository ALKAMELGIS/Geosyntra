use serde::Deserialize;
use serde_json::Value;

use crate::{api_client::ApiClient, error_display::ApiError};

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct EnvBinding {
    pub name: Option<String>,
    pub configured: Option<bool>,
    #[serde(rename = "envKey")]
    pub env_key: Option<String>,
    #[serde(rename = "requiredInProduction")]
    pub required_in_production: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ConfigStatusResponse {
    pub capabilities: Value,
    pub environment: Vec<EnvBinding>,
    #[serde(rename = "gatewayMode")]
    pub gateway_mode: Option<bool>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    pub configured: bool,
}

const PROVIDERS: &[(&str, &str)] = &[
    ("mapbox", "Mapbox"),
    ("arcgis", "ArcGIS Portal"),
    ("sentinelhub", "Sentinel Hub"),
    ("openweathermap", "OpenWeatherMap"),
    ("gemini", "Google Gemini"),
    ("openai", "OpenAI"),
    ("claude", "Anthropic Claude"),
    ("deepseek", "DeepSeek"),
    ("openrouteservice", "OpenRouteService"),
    ("graphhopper", "GraphHopper"),
];

pub async fn fetch_config_status(token: &str) -> Result<ConfigStatusResponse, ApiError> {
    let client = ApiClient::from_env();
    client
        .get_json("/api/config/status", Some(token))
        .await
}

pub fn provider_rows(capabilities: &Value) -> Vec<ProviderStatus> {
    PROVIDERS
        .iter()
        .map(|(id, label)| ProviderStatus {
            id: (*id).into(),
            label: (*label).into(),
            configured: capabilities
                .get(*id)
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
        .collect()
}

#[derive(Debug, Deserialize)]
pub struct MapboxConfig {
    pub configured: Option<bool>,
    #[serde(rename = "publicToken")]
    pub public_token: Option<String>,
    #[serde(rename = "proxyMode")]
    pub proxy_mode: Option<bool>,
}

pub async fn fetch_mapbox_config() -> Result<MapboxConfig, ApiError> {
    let client = ApiClient::from_env();
    client.get_json("/api/config/mapbox", None).await
}
