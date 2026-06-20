# Native GIS in Dioxus (Task 31 — fresh Mapbox bridge)

**Goal:** Replace the React iframe (Task 30) and legacy Leaflet port (Task 29) with a **new** Dioxus workspace: Rust UI + typed Rust↔JS bridge over **Mapbox GL**, phased to match React `SatelliteIntelligenceMain` feature domains without copying the 25k-line monolith.

**Status:** ✅ Task 31 shell complete · 🚧 **Task 32** — 100% React SI parity ([dioxus-gis-parity-100-plan.md](./dioxus-gis-parity-100-plan.md))

**Prerequisite:** Task 24 Start → `/satellite` ✅ · Task 23.5 gates (`app.access`, `aoi.read`) ✅

**React reference (read-only):** `frontend/src/pages/satellite/` (~626 files) — use for behavior spec, **do not copy** buggy paths (Leaflet legacy, iframe embed, Task 29 `packages/web` GIS code).

**Dioxus target:**

```text
packages/web/src/
  gis/native/                 # NEW — Task 31 bridge + basemap (no Task 29 reuse)
    mod.rs
    basemap.rs
    mapbox_bridge.rs
  pages/satellite/
    map_shell.rs              # layout: nav, rail slots, map canvas
    native_workspace.rs       # route component (replaces iframe host)
    basemap_picker.rs         # Phase 1 — minimal gallery
  assets/js/
    gis-mapbox-bridge.js      # NEW Mapbox GL lifecycle (global GeoSyntraMapbox)
```

**Dev driver:** `bash scripts/dev-dioxus-with-axum.sh` (Axum `:3003` + Dioxus `:8080`). **No Vite `:5173` required** for GIS after Phase 0 exit.

**Index:** [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md) (Task 28–30 superseded) · [dioxus-axum-plan.md](./dioxus-axum-plan.md)

---

## Architecture rules

| Layer | Owns |
|-------|------|
| **Mapbox GL JS** | WebGL **rendering engine** only (same as React SI) |
| **Esri / OSM / Carto** | Default **basemap tiles** — direct from `server.arcgisonline.com` etc. (no Mapbox tile API) |
| **Mapbox token** | Optional `pk.*` for Mapbox-hosted styles, geocoding, terrain; **not required** for Esri imagery |
| **GL init placeholder** | `pk.geosyntra.gl-init-placeholder` when API has no public token (React parity) |
| **JS bridge** (`GeoSyntraMapbox`) | Map instance lifecycle, style/layer mutations, camera |
| **Rust wrapper** | Typed API, JSON payloads, event registration |
| **Dioxus UI** | AppNavBar, toolbox rail, panels, auth/session, Axum API calls |

| Do **not** reuse | Reason |
|------------------|--------|
| Task 29 `leaflet_map.rs`, `gis-leaflet-bridge.js` | Superseded; Leaflet not in live React SI |
| Task 30 iframe + `gis-react-embed-bridge.js` | Second origin, auth race, embed chrome bugs |
| React Leaflet components (`BasemapGallery`, `DrawTools`, …) | Zero importers — dead code |
| Monolith state from `SatelliteIntelligenceMain.tsx` | 162+ `useState` — decompose by domain |

---

## SatelliteIntelligenceMain domain split

Source: `SatelliteIntelligenceMain.tsx` (~25.5k lines) + `frontend/src/pages/satellite/` (~626 files).

| Domain | Complexity | React anchor files | Dioxus task |
|--------|------------|-------------------|-------------|
| Bridge + map lifecycle | XL | `useAgroCloudMapboxMouseHost`, `siMapTeardown` | **31.0** |
| Basemaps + globe home | L | `basemapCatalog.ts`, `SiBasemapWidget.tsx` | **31.1** |
| Map shell + toolbox rail | L | `MapToolsDock`, `SatelliteMapAnalysisChrome` | **31.2** |
| Custom vector layers + registry | XL | `siMapCustomLayerRegistry.ts`, `siMapLayerRuntime.ts` | **31.3** |
| Symbology + labels | XL | `siLayerSymbologyEngine.ts`, `SiSymbologySidePanel.tsx` | **31.4** |
| AOI draw/edit + workspace | L | `aoi/SiAoiDrawingToolbar.tsx`, `siAoiGeometryEdit.ts` | **31.5** |
| Remote sensing / WMS / timeline | L | `SiSentinelHubRasterLayers`, `utils/satellite/` | **31.6** |
| Identify + popups + AGOL table | M | `runSatelliteMapIdentify.ts`, `SiMapFeaturePopup.tsx` | **31.7** |
| Upload + add-source | M | `SiUploadStagedDatasets.tsx` | **31.8** |
| Charts + AOI analytics | M | `useLiveAoiSpectralAnalysis`, Chart.js overlays | **31.9** |
| Geo AI shell | XL | `SatelliteGeoAiFloatingWidget`, `lib/geoAi*` | **31.10** |
| Routing / VRP / loc-alloc | M | `SiRouteMapToolPanel`, `siVrpEngine.ts` | **31.11** |
| Terrain / 3D / weather / BIM | L | deck.gl layers, `SiMapWeatherOverlay`, `SiBimExplorerDock` | **31.12** |
| Export / print / AOI report | M | `SiMapPrintModal`, `SiAoiReportModal` | **31.13** |
| Search + place | S | `siMapSearch.ts`, `SiMapPlaceSearch.tsx` | **31.14** |
| Fields (ag parcels) | M | `fields/fieldsStore.ts`, `FieldsPanel.tsx` | **31.15** |

---

## Phased delivery

### Phase 0 — Bridge foundation (Task 31.0) ✅

| Item | Deliverable |
|------|-------------|
| JS | `gis-mapbox-bridge.js` — `create`, `destroy`, `resize`, `setStyle`, `flyTo`, events |
| Rust | `gis/native/mapbox_bridge.rs` — typed wrapper + `MapHandle` |
| Dioxus | `native_workspace.rs` — permission gates, Esri map mount (no token required) |
| HTML | Mapbox GL CDN + bridge script in `index.html` |
| Exit | Signed-in owner sees pannable map at `/satellite/indices` **without iframe or Vite** |

### Phase 1 — Basemap gallery (Task 31.1) ✅

| Item | Deliverable |
|------|-------------|
| Rust | `native/basemap.rs` — Esri imagery/hybrid/streets/dark/topo + OSM |
| UI | `basemap_picker.rs` — quick presets + list (left float panel) |
| Bridge | `setStyle(mapId, styleJson)` wired from picker |
| Exit | User switches basemap; map persists view |

### Phase 2 — Map shell + toolbox rail (Task 31.2) ✅

| Item | Deliverable |
|------|-------------|
| Layout | 3D globe projection + `SI_GLOBE_HOME_VIEW` camera |
| Rail | Right glass toolbox rail (14 tools, icons) |
| HUD | Left float controls + WGS 84 / EPSG:4326 status bar |
| Bridge | `goHome`, `zoomBy`, `setProjection`, pointer events |
| Exit | Visual parity with React SI shell (tools light up; panels Phase 3+) |

### Phase 3 — Custom vector layers (Task 31.3) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | `addGeoJsonLayer`, `removeLayer`, `setLayerVisibility`, overlay registry |
| Rust | `LayerStore` integration + demo field polygon |
| UI | Layers list panel + add demo / paste GeoJSON |
| Exit | Toggle visibility; add GeoJSON from panel |

### Phase 4 — Symbology core (Task 31.4) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | `setLayerPaint` from style JSON |
| UI | Color picker (blue/green/orange) in layers panel |
| Exit | Change demo layer fill/line color |

### Phase 5 — AOI draw/edit (Task 31.5) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | Click-to-draw polygon + `finishDrawPolygon` |
| Storage | localStorage AOI CRUD via `aoi.rs` |
| UI | AOI panel — draw, finish, clear, list |
| Exit | Draw polygon, save, fit bounds |

### Phase 6 — Remote sensing / WMS (Task 31.6) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | `addRasterLayer` WMS tiles |
| UI | NDVI demo toggle in remote-sensing panel |
| Exit | Toggle WMS overlay on map |

### Phase 7 — Identify + popups (Task 31.7) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | `queryRenderedFeatures` on click |
| UI | Identify panel lists feature name/layer |
| Exit | Click vector layer → attribute list |

### Phase 8 — Upload + staging (Task 31.8) ✅

| Item | Deliverable |
|------|-------------|
| UI | Paste GeoJSON in Add data panel |
| Bridge | Add as custom overlay layer |
| Exit | Upload feature appears on map |

### Phase 9 — Charts + live AOI stats (Task 31.9) ✅

| Item | Deliverable |
|------|-------------|
| Rust | `geo_stats.rs` — polygon area km² |
| UI | Charts panel — area + demo NDVI bar |
| Exit | Select AOI → see area + chart stub |

### Phase 10 — Geo AI shell (Task 31.10) ✅

| Item | Deliverable |
|------|-------------|
| API | `/api/ai/chat` simulated provider |
| UI | Agent Chat panel with message log + composer |
| Exit | Send message → Axum simulated reply |

### Phase 11 — Routing / measure (Task 31.11) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | Line draw mode + haversine length |
| UI | Route + Measure panels |
| Exit | Click waypoints → path length readout |

### Phase 12 — Weather HUD (Task 31.12) ✅

| Item | Deliverable |
|------|-------------|
| UI | Weather panel with demo forecast at pointer |
| Exit | Toggle weather summary HUD |

### Phase 13 — Export / print (Task 31.13) ✅

| Item | Deliverable |
|------|-------------|
| Bridge | `exportMapPng` canvas capture |
| UI | Download map PNG button |
| Exit | Export current map view |

### Phase 14 — Search + place (Task 31.14) ✅

| Item | Deliverable |
|------|-------------|
| API | Nominatim geocode search |
| Bridge | `setSearchMarker` + `flyTo` |
| UI | Left float search panel |
| Exit | Search city → fly to + marker |

### Phase 15 — Fields (Task 31.15) ✅

| Item | Deliverable |
|------|-------------|
| Rust | `fields.rs` demo parcel store |
| UI | Fields panel + map overlays |
| Exit | Select field → fit bounds |

### Phase 16 — Decommission (Task 31.99) ✅

| Item | Deliverable |
|------|-------------|
| Delete | Task 29 Leaflet (`leaflet_map.rs`, `gis-leaflet-bridge.js`) |
| Delete | Task 30 embed bridge (`gis-react-embed-bridge.js`, `react_gis_url.rs`) |
| Delete | Unused Task 29 `basemap_catalog.rs`, `basemap_widget.rs` |
| Bridge | Disable Mapbox telemetry for `gl-init-placeholder` (no CORS to events.mapbox.com) |
| E2E | Playwright skips Vite `:5173` by default (`GEOSYNTRA_START_VITE=1` to enable) |

---

## Bridge event contract (Task 31.0)

JS → Rust via `window` `CustomEvent`:

| Event | Payload |
|-------|---------|
| `geosyntra-map-load` | `{ mapId }` |
| `geosyntra-map-error` | `{ mapId, message }` |
| `geosyntra-map-moveend` | `{ mapId, lng, lat, zoom, bearing, pitch }` |
| `geosyntra-map-click` | `{ mapId, lng, lat }` |

Rust → JS via `GeoSyntraMapbox.*` methods (JSON string args for complex payloads).

---

## Exit criteria (full program)

- [x] `/satellite/indices` — native Mapbox workspace, no iframe
- [x] `dev-dioxus-with-axum.sh` sufficient for GIS dev + E2E
- [x] Owner: basemap switch, draw/save AOI, WMS index, identify, all toolbox panels
- [x] Geo AI shell connected to Axum (simulated chat)
- [x] Task 30 iframe path removed (31.99)

---

## Estimated effort

| Phase | Duration |
|-------|----------|
| 0 — bridge | 1 week |
| 1 — basemap | 1 week |
| 2 — shell/rail | 2 weeks |
| 3–4 — layers/symbology | 6–8 weeks |
| 5 — AOI | 3 weeks |
| 6–7 — WMS/identify | 4 weeks |
| 8–13 — remaining domains | 12–16 weeks |
| 15 — decommission | 1 week |

**MVP (Phases 0–5):** ~2–3 months · **Full parity with React SI:** multi-quarter

---

## References

- React monolith: `frontend/src/pages/satellite/SatelliteIntelligenceMain.tsx`
- Mapbox config API: `/api/config/mapbox`
- Permissions: `app.access`, `aoi.read`, `aoi.write`
