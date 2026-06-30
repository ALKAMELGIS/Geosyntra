//! MPC zonal / WMS tile URL cache (Task 32.FD-3).

use std::collections::HashMap;

use super::ZonalAnalytics;

#[derive(Debug, Clone, Default)]
pub struct RasterCache {
    zonal: HashMap<String, ZonalAnalytics>,
    wms_urls: HashMap<String, String>,
}

impl RasterCache {
    pub fn zonal_key(index_id: &str, aoi_id: &str, datetime: &str) -> String {
        format!("{index_id}:{aoi_id}:{datetime}")
    }

    pub fn wms_key(index_id: &str, week_start: &str, week_end: &str) -> String {
        format!("{index_id}:{week_start}:{week_end}")
    }

    pub fn get_zonal(&self, key: &str) -> Option<&ZonalAnalytics> {
        self.zonal.get(key)
    }

    pub fn put_zonal(&mut self, key: String, value: ZonalAnalytics) {
        self.zonal.insert(key, value);
    }

    pub fn get_wms_url(&self, key: &str) -> Option<&String> {
        self.wms_urls.get(key)
    }

    pub fn put_wms_url(&mut self, key: String, url: String) {
        self.wms_urls.insert(key, url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zonal_key_format() {
        assert_eq!(
            RasterCache::zonal_key("NDVI", "aoi-1", "2026-01-01"),
            "NDVI:aoi-1:2026-01-01"
        );
    }
}
