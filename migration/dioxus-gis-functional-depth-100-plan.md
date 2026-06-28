# GIS functional depth 100% plan (Task 32.FD) — COMPLETE

**Goal:** Raise **functional behavior** (live APIs, real data, React-equivalent workflows) to **100%** for all 13 GIS parity areas.

**Status:** ✅ **Complete** — `parity.rs` weighted functional depth = **100%** (all 13 areas at 100%).

**Tracker:** `packages/web/src/gis/parity.rs`

---

## Functional depth tracker (final)

| Area | ID | FD task | Final | Exit criteria |
|------|-----|---------|-------|---------------|
| Backend GIS DB APIs | `backend_gis` | FD-1 | 100% | Analysis-engine proxy, external-tables client, AOI API sync |
| Layers & add data | `layers` | FD-2 | 100% | Upload/ArcGIS/STAC add-to-map, layer properties |
| Remote sensing | `remote_sensing` | FD-3 | 100% | Weekly WMS playback, AOI clip, MPC zonal, raster cache |
| AOI | `aoi` | FD-4 | 100% | API sync, report PDF, live charts |
| Symbology | `symbology` | FD-5 | 100% | Engine + studio + WMS legend |
| Routing / VRP | `routing` | FD-6 | 100% | GraphHopper/ORS live, compute route, VRP solvers |
| Weather | `weather` | FD-7 | 100% | Live fetch HUD + on-map overlay |
| Geo AI | `geo_ai` | FD-8 | 100% | Auto model provider from config |
| Charts / analytics | `charts` | FD-9 | 100% | Live zonal + map overlay charts |
| Print / export | `print` | FD-10 | 100% | Print manifest + GeoTIFF export spec |
| GIS Content settings | `gis_content` | FD-11 | 100% | No demo seed; local CRUD |
| Map shell | `map_shell` | FD-12 | 100% | Mapbox config, globe, error banner |
| Toolbox shell | `toolbox` | FD-13 | 100% | Full panel routing + workflow |

---

## FD-1 — Live API wiring ✅

| Deliverable | Status |
|-------------|--------|
| Analysis-engine Axum proxy | ✅ `interface/gateway/analysis_engine_proxy.rs` |
| MPC zonal sample client | ✅ `web/api/gis/analysis_engine.rs` |
| AOI API sync on load/save | ✅ `native_workspace.rs` + `aoi_remote.rs` |
| Weather `fetch_weather_at` on pointer | ✅ `native_workspace.rs` + `weather_overlay.rs` |
| GraphHopper route compute | ✅ `RoutePanel` + `fetch_route` overlay |
| STAC live collections | ✅ `stac_explore_panel.rs` |
| GIS external-tables client | ✅ `web/api/gis/external_tables.rs` |
| GIS content: no demo seed | ✅ `gis_content_store.rs` |
| Timeline week WMS updates | ✅ `sentinel/mod.rs` + playback loop |
| Live zonal stats path | ✅ `aoi_zonal_stats.rs` → ChartsPanel |

---

## Test gates (green)

```bash
cargo test -p geosyntra-web --lib parity
bash scripts/run-playwright-with-logs.sh
```
