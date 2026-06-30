# Dioxus GIS — 100% React SI parity plan (Task 32)

**Goal:** Raise every Satellite/GIS parity area from current MVP (~15–20% weighted) to **100%** against React `SatelliteIntelligenceMain` on `main` (`c8f42626`).

**Prerequisite:** Task 31 native Mapbox shell ✅ (bridge, rail, demo panels).

**Reference (read-only):** `frontend/src/pages/satellite/` (~626 files, ~25.5k-line monolith).

**Target:** `packages/web/src/gis/`, `packages/web/src/pages/satellite/`, `packages/interface/src/gis/`.

**Workflow:** One subtask → tests green → commit → next ([task-execution-workflow.md](./task-execution-workflow.md)).

---

## Parity tracker (update after each Task 32.x commit)

| Area | Baseline | Current | Target | Task |
|------|----------|---------|--------|------|
| Map shell / basemap / globe | 40% | 40% | 100% | 32.1 |
| Toolbox UI shell | 35% | 35% | 100% | 32.2 |
| Layers & add data | 15% | 15% | 100% | 32.3 |
| Remote sensing / indices | 20% | 20% | 100% | 32.5 |
| AOI | 25% | 25% | 100% | 32.6 |
| Symbology | 5% | 5% | 100% | 32.4 |
| Routing / VRP / loc-alloc | 5% | 5% | 100% | 32.7 |
| Weather | 10% | 10% | 100% | 32.8 |
| Geo AI | 15% | 15% | 100% | 32.9 |
| Charts / analytics | 5% | 5% | 100% | 32.10 |
| Print / export | 20% | 20% | 100% | 32.11 |
| GIS Content settings | 5% | 5% | 100% | 32.12 |
| Backend GIS DB APIs | 0% | **in progress** | 100% | **32.0** |
| **Weighted overall** | ~18% | ~18% | **100%** | 32.0–32.12 |

Tracked in code: `packages/web/src/gis/parity.rs` (unit test gate).

---

## Task 32.0 — Backend GIS DB APIs (Express → Axum) ⏳

Port in-memory GIS external tables + relationships from `backend/server/index.js` (lines ~1101–1436).

| Method | Path | Express | Axum target |
|--------|------|---------|-------------|
| GET | `/api/gis/external-tables` | ✅ | `gis::list_external_tables` |
| GET | `/api/gis/external-tables/{table}/schema` | ✅ | `gis::get_table_schema` |
| GET | `/api/gis/external-tables/{table}/rows` | ✅ | `gis::list_table_rows` |
| POST | `/api/gis/external-tables/{table}/rows` | ✅ | `gis::create_table_row` |
| PUT | `/api/gis/external-tables/{table}/rows/{rowId}` | ✅ | `gis::update_table_row` |
| DELETE | `/api/gis/external-tables/{table}/rows/{rowId}` | ✅ | `gis::delete_table_row` |
| GET | `/api/gis/relationships` | ✅ | `gis::list_relationships` |
| POST | `/api/gis/relationships` | ✅ | `gis::create_relationship` |
| PUT | `/api/gis/relationships/{id}` | ✅ | `gis::update_relationship` |
| DELETE | `/api/gis/relationships/{id}` | ✅ | `gis::delete_relationship` |
| POST | `/api/gis/resolve` | ✅ | `gis::resolve_relationships` |
| POST | `/api/gis/db/test` | ✅ | `gis::test_db_connection` |

**Exit:** Route golden + `interface` integration tests; `express-route-inventory.md` marks ✅.

---

## Task 32.1 — Map shell / basemap / globe (40% → 100%)

| Sub | React source | Rust target | Deliverable |
|-----|--------------|-------------|-------------|
| 32.1a | `SiMapDaylightPanel.tsx`, `SiMapSunSkyMapOverlay.tsx` | `pages/satellite/daylight_panel.rs` | Daylight arc slider + sun position overlay |
| 32.1b | `esriWorldElevationTerrainBasemap.ts` | `gis/native/terrain_basemap.rs` | Elevation terrain underlay in 3D |
| 32.1c | `SiMapSpaceBackdrop.tsx`, `SiMapGeoSyntraBrand.tsx` | `map_shell.rs` | Space backdrop + brand chrome |
| 32.1d | `SiMapErrorBoundary.tsx`, `SiMapMapboxStatusBanner.tsx` | `native_workspace.rs` | Error boundary + token status banner |
| 32.1e | `MapToolsDock.tsx` (portal metrics) | `map_shell.rs` + bridge events | Full toolbox portal sync to app chrome |
| 32.1f | `useSiViewportFitMode.ts`, `siMapResponsiveShell.css` | SCSS + `map_shell.rs` | Responsive density tiers |

---

## Task 32.2 — Toolbox UI shell (35% → 100%)

| Sub | React source | Rust target |
|-----|--------------|-------------|
| 32.2a | `SatelliteContextualAnalysisDock.tsx` RAIL (11 panel ids) | `toolbox_rail.rs` + `contextual_dock.rs` |
| 32.2b | `SmartProcessingWorkflowPanel.tsx` | `processing_workflow_panel.rs` |
| 32.2c | `SatelliteMapProcessingOptionsPortal.tsx` | Portal host in `map_shell.rs` |
| 32.2d | `SiMapLayerControlMount.tsx` | `layer_control_mount.rs` + bridge |
| 32.2e | Map-only float tools (route, swipe, elev, weather intel, quick dash) | Wire all rail toggles in `native_workspace.rs` |

---

## Task 32.3 — Layers & add data (15% → 100%)

| Sub | React source | Rust target |
|-----|--------------|-------------|
| 32.3a | `SiUploadStagedDatasets.tsx`, `uploadStagingModel.ts` | `gis/upload_staging.rs`, `upload_panel.rs` |
| 32.3b | `shapefileImport.ts`, `FileLoader.ts` | `gis/shapefile_import.rs` (wasm) |
| 32.3c | `addSourceLayerHelpers.ts`, `arcgisFeatureLayerClient.ts` | `gis/arcgis_layer.rs` |
| 32.3d | STAC (`SatelliteIntelligenceMain` STAC block ~980–1950) | `gis/stac.rs`, `stac_explore_panel.rs` |
| 32.3e | `SiEnvAddedLayersList.tsx`, `SiLayerPropertiesPanel.tsx` | Expand `tool_panel.rs` LayersPanel |
| 32.3f | `SiAgolTableDockChrome.tsx`, pagination, filters | `agol_table_dock.rs` |
| 32.3g | `SiBimExplorerDock.tsx`, 3D extrusion | `bim_explorer.rs` + bridge fill-extrusion |

---

## Task 32.4 — Symbology (5% → 100%) — deep migration notes

### React architecture (do not copy monolith — port by module)

```
symbologyHelpers.ts          → gis/symbology/helpers.rs
siCategorySymbolStyle.ts     → gis/symbology/category.rs
siSymbolStyleStudio.ts       → gis/symbology/studio.rs
siLayerSymbologyEngine.ts    → gis/symbology/engine.rs      (core Mapbox paint builder)
siGlobalLayerStyleController.ts → gis/symbology/forced_style.rs
lib/arcgisDrawingInfoMapbox.ts  → gis/symbology/arcgis_drawing_info.rs
components/SiSymbologySidePanel.tsx → pages/satellite/symbology_panel.rs
components/SiSymbologyAttributePanels.tsx → symbology_attribute_panels.rs
components/SiWmsSymbologyPopup.tsx → wms_symbology_popup.rs
utils/siSymbologySmartMapping.ts → gis/symbology/smart_mapping.rs
utils/siWmsLegendClassStyle.ts  → gis/symbology/wms_legend.rs
```

### Data model mapping

| React (`LayerManager` / `SymbologyConfig`) | Rust (`gis/symbology/types.rs`) |
|---------------------------------------------|-----------------------------------|
| `style: 'single' \| 'unique' \| 'graduated'` | `SymbologyStyle` enum |
| `field`, `classes[]`, `ramp` | `GraduatedConfig`, `ClassBreak` |
| `categoryStyles: Record<string, CategoryStyle>` | `HashMap<String, CategoryStyle>` |
| `useArcGisOnline`, `userConfigured` | flags on `LayerSymbologyState` |
| `appearance: SiSymbologyAppearance` | `StrokeStyle`, `FillStyle`, `BlendMode` |
| WMS `symStopsForWmsLayerId` | `WmsRampStop` + bridge raster paint |

### Bridge requirements (extend `gis-mapbox-bridge.js`)

| Method | Purpose |
|--------|---------|
| `setLayerPaint(mapId, layerId, paintJson)` | ✅ exists |
| `setFilter(mapId, layerId, filterJson)` | geometry-type filters (poly/line/point) |
| `addLayerBefore(mapId, layerSpec, beforeId)` | z-order / symbology remount |
| `setLayoutProperty` | labels, visibility expressions |
| `querySourceFeatures` | attribute drive preview |

### Phased delivery

| Sub | Scope | Exit test |
|-----|-------|-----------|
| 32.4a | `types.rs` + persist to localStorage | serde round-trip |
| 32.4b | `engine.rs` — single + unique value paints | port `siLayerSymbologyEngine.test.ts` cases |
| 32.4c | Graduated ramps + `sampleRamp` | ramp color at class boundaries |
| 32.4d | ArcGIS drawingInfo → Mapbox paint | port arcgis tests |
| 32.4e | `symbology_panel.rs` UI (studio tabs) | e2e symbology apply |
| 32.4f | WMS classified ramp + on-map legend | match `SiWmsIndexClassificationLegend` |

---

## Task 32.5 — Remote sensing / Sentinel timeline (20% → 100%) — deep migration notes

### React architecture

```
components/SiSentinelHubRasterLayers.tsx     → gis/sentinel/raster_layers.rs (orchestration)
lib/sentinelHubWmsAoiClip.ts                 → gis/sentinel/aoi_clip.rs
lib/siSentinelHubWmsMapZoom.ts               → gis/sentinel/wms_zoom.rs
utils/useSiWmsTimelineCrossfade.ts           → gis/sentinel/timeline_crossfade.rs
utils/siTimelineDateRange.ts                 → gis/sentinel/timeline_range.rs
utils/siTimelineWeekIndex.ts                 → gis/sentinel/timeline_week.rs
utils/siTimelineTransition.ts                → gis/sentinel/timeline_transition.rs
components/SiTimelineOptionsModal.tsx        → pages/satellite/timeline_options_modal.rs
hooks/useLiveAoiSpectralAnalysis.ts          → gis/sentinel/live_aoi_analysis.rs
workers/liveAoiSpectral.worker.ts            → optional wasm worker / async fetch
utils/siWmsLiveIndexLegendConfig.ts          → gis/sentinel/wms_legend_config.rs
lib/wmsAoiLiveRasterCache.ts                 → gis/sentinel/raster_cache.rs
```

### Timeline state machine

1. User sets `time_series_start` / `time_series_end` (Remote sensing panel) ✅ partial
2. `generateTimeline()` builds weekly composite list (`siTimelineWeekIndex.ts`)
3. For each week: build WMS tile URL with TIME param + AOI clip evalscript (`buildSentinelHubWmsAoiClip`)
4. `SiSentinelHubRasterLayers` mounts raster sources; crossfade via `useSiWmsTimelineCrossfade`
5. Charts panel reads `weeklyMeans` from zonal stats hook

### Bridge requirements

| Method | Purpose |
|--------|---------|
| `addRasterLayer` with dynamic `setTiles` | ✅ extend bridge |
| `setRasterOpacity` per run | timeline crossfade |
| `setRasterPaint` color ramp | classified indices |

### API dependencies

- `GET /api/gateway/sentinel/credentials` ✅
- `GET /api/config/sentinel` ✅
- Optional: MPC zonal API (`lib/mpcPlanetaryApi.ts`) → new Axum proxy or direct client

### Phased delivery

| Sub | Scope |
|-----|-------|
| 32.5a | Real WMS URL builder with TIME + MAXCC + clip WKT |
| 32.5b | Weekly index from date range |
| 32.5c | Bridge tile swap + crossfade |
| 32.5d | Timeline options modal (transition mode, playback speed) |
| 32.5e | Live zonal stats fetch + cache |
| 32.5f | On-map WMS legend overlay |

---

## Task 32.6 — AOI (25% → 100%) — deep migration notes

### React architecture

```
components/aoi/SiAoiDrawingToolbar.tsx       → aoi/drawing_toolbar.rs
components/aoi/SiAoiGeometryEditControls.tsx → aoi/geometry_edit.rs
utils/siAoiGeometryEdit.ts                   → gis/aoi/geometry_edit.rs
components/aoi/SiAoiObjectsPanel.tsx         → expand AoiPanel in tool_panel.rs
components/SiAoiReportModal.tsx              → pages/satellite/aoi_report_modal.rs
utils/siAoiVegetationReportModel.ts          → gis/aoi/report_model.rs
utils/siAoiVegetationReportPdfExport.ts      → gis/aoi/report_pdf.rs (print-js or wasm pdf)
utils/siAoiVegetationReportDocx.ts           → defer or server-side export
utils/siAoiZonalStats.ts                     → gis/aoi/zonal_stats.rs
hooks/useLiveAoiSpectralAnalysis.ts          → shared with 32.5e
components/AoiStaticMultiLayerLineChart.tsx  → charts/aoi_multi_line_chart.rs
store/siAoiReportAnalysisStore.ts            → gis/aoi/report_analysis_store.rs
```

### AOI report PDF pipeline (React)

1. `buildSiAoiVegetationReport()` from table rows + AOI geometry
2. Capture map snapshot (`siMapViewerSnapshot.ts`) — basemap + index overlay validation
3. `compositeMapWithBottomLegendStrip` — legend items from classification
4. `drawNorthArrowAndScaleOnMapCanvas` — cartography
5. `exportSiAoiVegetationReportPdf` — jsPDF multi-page
6. Optional Gemini: `fetchSiAoiReportExecutiveSummaryFromGemini`

### Rust migration strategy

| Piece | Approach |
|-------|----------|
| Report model | Port `SiAoiReportModel` struct + builders to `report_model.rs` |
| PDF | Phase 1: PNG pages via bridge + `printpdf` crate; Phase 2: full layout parity |
| Map snapshot | `exportMapPng` ✅ + composite in Rust canvas (web-sys) |
| Gemini summary | `/api/gateway/gemini/generate-content` ✅ |
| Live analysis section | Wire to 32.5e zonal stats |

### Phased delivery

| Sub | Scope |
|-----|-------|
| 32.6a | Rectangle + circle draw modes in bridge |
| 32.6b | Vertex edit + transform handles |
| 32.6c | Multi-AOI rename/delete + API sync |
| 32.6d | Report modal UI + model builder |
| 32.6e | PDF export (single-page MVP → multi-page) |
| 32.6f | Static + live chart overlays on map |

---

## Task 32.7 — Routing / VRP / loc-alloc (5% → 100%)

| React source | Rust target |
|--------------|-------------|
| `SiRouteMapToolPanel.tsx` | `route_map_panel.rs` |
| `lib/graphHopperRouting.ts` | `api/gis/graphhopper.rs` + gateway ✅ |
| `lib/openRouteServiceRouting.ts` | `api/gis/ors.rs` |
| `utils/siVrpEngine.ts`, `SiRouteMapVrpSection.tsx` | `gis/routing/vrp.rs` |
| `utils/siLocationAllocationEngine.ts` | `gis/routing/loc_alloc.rs` |
| `SiRouteElevationChart.tsx` | `route_elevation_chart.rs` |
| `SiRouteTurnByTurnList.tsx`, `SiRouteNavigationHud.tsx` | navigation HUD components |

---

## Task 32.8 — Weather (10% → 100%)

| React source | Rust target |
|--------------|-------------|
| `SiMapWeatherToolPanel.tsx`, `SiMapWeatherIntelPopup.tsx` | `weather_intel_panel.rs` |
| `SiMapWeatherOverlay.tsx`, temporal comparison | `weather_overlay.rs` |
| Open-Meteo client | `api/gis/open_meteo.rs`; wire `/api/gateway/openweathermap` proxy |

---

## Task 32.9 — Geo AI (15% → 100%)

| React source | Rust target |
|--------------|-------------|
| `SiGeoExplorerChatPanel.tsx` | expand `GeoAiPanel` |
| `runSatelliteMapIdentify.ts`, inspect popups | `gis/identify.rs`, `feature_popup.rs` |
| `siGeoAiMapSelectionPaint.ts` | bridge highlight layers |
| `smart-suggestions/*` | `smart_suggestions_panel.rs` |
| Multi-provider keys | config endpoints ✅ |

---

## Task 32.10 — Charts / analytics (5% → 100%)

| React source | Rust target |
|--------------|-------------|
| `AoiStaticMultiLayerLineChart.tsx` | `charts/aoi_line_chart.rs` (canvas/svg) |
| `SiQuickDashboardPanel.tsx` | `quick_dashboard_panel.rs` |
| `weeklyCompositeStats.ts` | `gis/analytics/weekly_stats.rs` |
| `staticAoiMultiChartData.ts` | `gis/analytics/chart_data.rs` |

---

## Task 32.11 — Print / export (20% → 100%)

| React source | Rust target |
|--------------|-------------|
| `SiMapPrintModal.tsx`, `SiMapPrintCustomLayout.tsx` | `print_modal.rs` |
| PDF multi-page layout | `gis/export/print_pdf.rs` |
| `writeRgbGeoTiff4326.ts` | `gis/export/geotiff.rs` |

---

## Task 32.12 — GIS Content settings (5% → 100%)

| React source | Rust target |
|--------------|-------------|
| `settings/gis-content/GisContent.tsx` | expand `settings/gis_content.rs` |
| `gisContentPortalStore.ts`, folder/share/move modals | `gis_content_store.rs` + modals |
| `CreateFeatureLayerWizard.tsx`, `Create3dLayerWizard.tsx` | wizard components |

---

## Commit cadence (Task 32)

| # | Message (draft) | Scope |
|---|-----------------|-------|
| 1 | `Task 32.0: port Express GIS DB APIs to Axum` | interface/gis |
| 2 | `Task 32.4a: symbology types and engine foundation` | gis/symbology |
| 3 | `Task 32.5a: Sentinel WMS URL builder with TIME/AOI clip` | gis/sentinel |
| 4+ | One subtask per row above | … |

Run before each commit: `cargo test -p interface -p geosyntra-web` + `bash scripts/check-route-parity.sh`.

---

## References

- Task 31 MVP shell: [dioxus-gis-native-plan.md](./dioxus-gis-native-plan.md)
- Express GIS routes: `backend/server/index.js` ~1101–1436
- Route inventory: [express-route-inventory.md](./express-route-inventory.md)
