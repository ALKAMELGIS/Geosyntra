//! Place search via Nominatim (Task 31.14).

use serde::Deserialize;

use crate::error_display::ApiError;

#[derive(Debug, Clone, Deserialize)]
pub struct GeocodeHit {
    pub lat: String,
    pub lon: String,
    #[serde(default)]
    pub display_name: String,
}

pub async fn search_places(query: &str) -> Result<Vec<GeocodeHit>, ApiError> {
    let q = query.trim();
    if q.len() < 2 {
        return Ok(Vec::new());
    }
    search_places_impl(q).await
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
async fn search_places_impl(q: &str) -> Result<Vec<GeocodeHit>, ApiError> {
    let url = format!(
        "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=5",
        urlencoding(q)
    );
    let resp = gloo_net::http::Request::get(&url)
        .header("Accept", "application/json")
        .header("User-Agent", "GeoSyntra-Dioxus/1.0")
        .send()
        .await
        .map_err(ApiError::network)?;
    if !resp.ok() {
        return Err(ApiError::from_body(
            resp.status(),
            &resp.text().await.unwrap_or_default(),
        ));
    }
    resp.json::<Vec<GeocodeHit>>()
        .await
        .map_err(ApiError::network)
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
async fn search_places_impl(_q: &str) -> Result<Vec<GeocodeHit>, ApiError> {
    Ok(Vec::new())
}

fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "+".to_string(),
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}
