# Full interactive GIS map in Dioxus (Task 28)

**Goal:** Replace the Task 23 **React iframe bridge** at `/satellite` with a **native Dioxus GeoAI workspace** — full Mapbox map, AOI tools, layers, indices, and analysis chrome — matching React `/satellite/indices` behavior on a single origin (`:8080` dev, Axum static prod).

**Status:** ✅ **MVP complete** (28.1–28.15 foundation). GeoSyntra (GOS) continues hardening (Axum AOI API, full React parity) before cutover.

**Prerequisite:** Task 24 post-login workspace entry (Start → `/satellite`) ✅ · Task 23.5 permission gates (`app.access`, `aoi.read`) recommended before full QA.

**React source of truth:** `frontend/src/pages/satellite/` (especially `SatelliteIntelligenceMain.tsx`, `siMap*.ts`, AOI/fields components, workers)  
**Dioxus target:** `packages/web/src/pages/satellite/` (expand from bridge stub) · optional `packages/web/src/gis/` shared module crate later

**Interim dev (historical):** `bash scripts/dev-full-platform.sh` — only needed before Task 28.13 bridge removal. **Daily driver:** `bash scripts/dev-dioxus-with-axum.sh`.

**Index:** [dioxus-axum-plan.md](./dioxus-axum-plan.md) · [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md) · [axum-migration-plan.md](./axum-migration-plan.md)

---

## Why Task 28 was the cutover gate (resolved ✅)

| Before (Task 23.2 bridge) | After Task 28 MVP |
|---------------------------|-------------------|
| `/satellite` showed status card + iframe to React `:5173` | `/satellite/indices` is a Dioxus route with live Mapbox map |
| Cross-origin auth in dev (8080 vs 5173) | Single origin; session + Mapbox token from Axum |
| React Vite required for GIS | `dev-dioxus-with-axum.sh` alone — no `:5173` |
| “Start” opened bridge, not real workspace | “Start” opens full interactive map in Dioxus |

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
| **Map rendering** | Mapbox GL JS allowed as the only heavy JS dependency (same as React). Wrap in Rust-owned lifecycle (mount, token, resize, destroy). |
| **API** | Existing Axum routes: `/api/config/mapbox`, `/api/gateway/mapbox/*`, AOI CRUD when wired — no new Express. |
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

- [x] Signed-in user with `app.access` + `aoi.read` reaches **`/satellite/indices`** with **interactive Mapbox map** (pan/zoom, basemap) — no React iframe
- [x] Owner can draw/save/load AOIs on the map (localStorage; server API follow-up)
- [x] Mapbox configured via Axum; clear error when token missing (link to settings)
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
- Bridge (removed): `packages/web/src/pages/satellite/map_workspace.rs`
- JS bridge (Mapbox only): `packages/web/public/assets/js/gis-mapbox-bridge.js`
- Dev scripts: `scripts/dev-full-platform.sh` (interim), `scripts/dev-dioxus-with-axum.sh` (target)
- Map API: `/api/config/mapbox`, `/api/gateway/mapbox/*` in [axum-route-inventory.golden](./axum-route-inventory.golden)
