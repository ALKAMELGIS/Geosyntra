//! In-page hash navigation — parity with React hash router helpers.

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn scroll_to_hash(hash: &str) {
    use wasm_bindgen::JsCast;
    let id = hash.trim_start_matches('#');
    if id.is_empty() {
        return;
    }
    let Some(document) = web_sys::window().and_then(|w| w.document()) else {
        return;
    };
    if let Some(element) = document.get_element_by_id(id) {
        let _ = element.scroll_into_view_with_bool(true);
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn scroll_to_hash(_hash: &str) {}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
pub fn scroll_to_hash_on_load() {
    if let Some(window) = web_sys::window() {
        if let Ok(hash) = window.location().hash() {
            if !hash.is_empty() && hash != "#" {
                scroll_to_hash(&hash);
            }
        }
    }
}

#[cfg(not(all(feature = "web", target_arch = "wasm32")))]
pub fn scroll_to_hash_on_load() {}

pub fn hash_from_href(href: &str) -> Option<&str> {
    href.strip_prefix('#').filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_hash_from_href() {
        assert_eq!(hash_from_href("#pricing"), Some("pricing"));
        assert_eq!(hash_from_href("/dashboard"), None);
    }
}
