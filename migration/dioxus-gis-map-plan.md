# GIS workspace in Dioxus (Task 28 → Task 30 React embed → **Task 31 native**)

**Goal:** Native Dioxus Mapbox workspace at `/satellite/indices` — see **[dioxus-gis-native-plan.md](./dioxus-gis-native-plan.md)** (Task 31, current).

**Status:** 🚧 **Task 31 Phase 0** — fresh Mapbox bridge + native shell (iframe superseded).

**Superseded approaches:**
- Task 30 React iframe — `react_gis_url.rs`, `gis-react-embed-bridge.js`
- Task 29 Leaflet port — `leaflet_map.rs`, `gis-leaflet-bridge.js`

**Prerequisite:** Task 24 post-login workspace entry (Start → `/satellite`) ✅ · Task 23.5 permission gates (`app.access`, `aoi.read`).

**Dev driver:** `bash scripts/dev-dioxus-with-axum.sh` (Axum `:3003` + Dioxus `:8080`).

**Index:** [dioxus-gis-native-plan.md](./dioxus-gis-native-plan.md) · [dioxus-axum-plan.md](./dioxus-axum-plan.md)

---

## Task 30 — React GIS iframe (current)

| Item | Path |
|------|------|
| Iframe host (Dioxus) | `packages/web/src/pages/satellite/map_workspace.rs` |
| Embed URL + auth push | `packages/web/src/pages/satellite/react_gis_url.rs` |
| Parent JS bridge | `packages/web/public/assets/js/gis-react-embed-bridge.js` |
| Child auth listener | `frontend/src/lib/geosyntraDioxusEmbedBridge.ts` |
| Embed chrome (hide React nav) | `frontend/src/App.tsx` (`?embed=1` / iframe detection) |

| Rule | Detail |
|------|--------|
| **Renderer** | Full React `SatelliteIntelligenceMain` — Mapbox GL, Esri basemaps, all SI tools |
| **Iframe URL (dev)** | `http://127.0.0.1:5173/Geosyntra/#/satellite/indices?embed=1` |
| **Override** | `window.GEOSYNTRA_REACT_GIS_URL` in `index.html` or env at build |
| **Auth** | Dioxus `geosyntra_auth_v1` → `postMessage` → React `startSession` |
| **Dioxus chrome** | `AppNavBar` only; map toolbox/panels live inside iframe |

### Task 30 exit criteria

- [x] `/satellite/indices` shows full-viewport React iframe
- [x] Auth session pushed on iframe load (postMessage bridge)
- [x] React hides duplicate app chrome in embed mode
- [x] Playwright map-workspace green with Vite on `/Geosyntra/`
- [ ] Production same-origin path (serve `frontend/dist` behind Axum — follow-up)

---

## Task 29 — Native Esri/Leaflet (superseded by Task 30)

Native Dioxus Leaflet port (`basemap_catalog.rs`, `leaflet_map.rs`, `basemap_widget.rs`) retained in repo for reference but **not wired** after Task 30. Re-enable only if iframe is removed again.

---

## Why Task 28 was the cutover gate (updated)

| Before (Task 23.2) | After Task 30 |
|--------------------|---------------|
| Status card + broken same-origin iframe | Full-viewport iframe → React `:5173` |
| Partial / placeholder map | **100% React SI parity** from `main` |
| Auth split across origins | `postMessage` auth bridge from Dioxus parent |
| `dev-dioxus-with-axum.sh` only | **`dev-full-platform.sh`** for GIS dev + E2E |

---

## Architecture

```text
packages/web/src/
  pages/satellite/
    mod.rs              # route shell, permission gates
    map_shell.rs        # layout: toolbox rail, map canvas, panels
    mapbox_bridge.rs    # Mapbox GL via wasm-bindgen / web component (minimal JS)
    aoi/                # draw, edit, list (ports siAoi*)
    layers/             # layer control, symbology
    indices/            # spectral / WMS timeline
    analysis/           # charts, GeoAI assistant chrome
  gis/                  # (optional) pure Rust helpers — no Mapbox dependency
```

| Layer | Rule |
|-------|------|
| **Map rendering** | Leaflet + Esri rasters (Task 29). Mapbox GL removed from Dioxus; React may still use Mapbox shell until cutover. |
| **API** | AOI CRUD via Axum; basemap tiles direct to Esri (no proxy). Mapbox routes remain for React/settings only. |
| **Permissions** | Route gate: `app.access` + `aoi.read`; write tools need `aoi.write` / plan gates per MATRIX. |
| **Tenant** | AOI and layer state scoped to `session.tenant_id` (Task 23.5). |
| **Styling** | Port satellite SCSS from `frontend/src/pages/satellite/**/*.css` into `packages/web/assets/scss/gis/`. |

---

## Task 28 iterations

### Phase A — Map shell + routing (P0)

| Iteration | Deliverable |
|-----------|-------------|
| **28.1** | Dioxus routes `/satellite`, `/satellite/indices` (default workspace); remove iframe-only UX as primary path |
| **28.2** | Mapbox token fetch + map mount/unmount (`fetch_mapbox_config`, public token route) |
| **28.3** | Responsive map shell (toolbox rail, panel slots) — port `siMapResponsiveShell` layout |
| **28.4** | Basemap + navigation controls; empty map loads for signed-in owner/trial user |

### Phase B — AOI core (P0)

| Iteration | Deliverable |
|-----------|-------------|
| **28.5** | AOI draw toolbar (polygon/rectangle) + geometry edit |
| **28.6** | AOI list panel + select/fit bounds |
| **28.7** | Persist AOI via Axum API (tenant-scoped); load on map init | ✅ in-memory MVP |

### Phase C — Layers & indices (P1)

| Iteration | Deliverable |
|-----------|-------------|
| **28.8** | Layer control panel + added layers store |
| **28.9** | Spectral indices / WMS timeline (minimum viable: one index layer + legend) |
| **28.10** | Identify / feature popup at click |

### Phase D — Analysis & parity (P1–P2)

| Iteration | Deliverable |
|-----------|-------------|
| **28.11** | Static AOI comparison / chart strip (subset of React analysis chrome) |
| **28.12** | GeoAI floating assistant shell (API hookup; full agent logic can follow cutover) |

### Phase E — Decommission bridge (P0 exit)

| Iteration | Deliverable |
|-----------|-------------|
| **28.13** | Delete React iframe embed path; `dev-dioxus-with-axum.sh` is sufficient for GIS |
| **28.14** | Playwright: login → Start → map canvas visible on `/satellite/indices` (no 5173) |
| **28.15** | Document React satellite deprecation; keep `frontend/` for regression diff until Task 27 |
| **28.16** | Unified `AppNavBar` on `/`, `/dashboard`, `/satellite/indices` | ✅ |

---

## Exit criteria

- [x] Signed-in user with `app.access` + `aoi.read` reaches **`/satellite/indices`** with **interactive Esri/Leaflet map** (pan/zoom, basemap gallery) — no React iframe
- [x] Owner can draw/save/load AOIs on the map (localStorage; server API follow-up)
- [x] Map loads without Mapbox token (Esri tiles direct)
- [x] `bash scripts/dev-dioxus-with-axum.sh` alone — **no** Vite `:5173` required for GIS smoke
- [x] Task 25 Playwright: **map workspace spec** added (`map-workspace.spec.ts`)
- [x] React iframe bridge **removed** from `/satellite`

---

## Estimated effort

| Phase | Duration |
|-------|----------|
| A — shell + Mapbox | 2–3 weeks |
| B — AOI core | 3–4 weeks |
| C — layers/indices | 4–6 weeks |
| D — analysis subset | 4+ weeks (parallelizable after B) |
| E — bridge removal + E2E | 1 week |

**Total:** ~3–4 months for MVP parity; full React feature parity is multi-quarter (600+ satellite files).

---

## References

- React map entry: `frontend/src/pages/satellite/SatelliteIntelligenceMain.tsx`
- Routes: `frontend/src/routes/AppRoutes.tsx` (`/satellite/indices`)
- Bridge (removed): React iframe path
- JS bridge (Leaflet + Esri): `packages/web/public/assets/js/gis-leaflet-bridge.js`
- Dev scripts: `scripts/dev-full-platform.sh` (interim), `scripts/dev-dioxus-with-axum.sh` (target)
- Map API: `/api/config/mapbox`, `/api/gateway/mapbox/*` in [axum-route-inventory.golden](./axum-route-inventory.golden)
