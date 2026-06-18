# Dioxus + Axum plan (Tasks 19–32)

**Goal:** Replace React/Vite with a **Dioxus fullstack web** app backed by Axum, then **desktop**, then **mobile** — with **SCSS styling**, **Rust-first UI logic**, and a dedicated **admin console** for Axum-only configuration (policy versions, ABAC, tokens, billing ops).

**All work on `feature/axum-migration`.** No merge-to-`main` milestone — the feature branch is the deployment line. Tasks **23.5, 25, 28, 33, and 34** are ✅ complete; Task **27** deploy hardening is the active track.

**Index:** [axum-migration-plan.md](./axum-migration-plan.md)

---

## Execution priority — GeoSyntra (GOS)

| Order | Task | Status |
|-------|------|--------|
| **1 — NOW** | **27 — Deploy hardening** (wasm SSR, Mapbox proxy, rollback docs) | ▶ Active |
| 2 | **23.6 — Redis auth cache** | Optional / parallel |
| 3 | **28.8+ — GIS parity follow-ups** | Optional / parallel |
| 4 | **29–32 — Desktop / mobile** | After 27 |

---

## Design principles

| Topic | Rule |
|-------|------|
| **Styling** | **SCSS** as the source of truth (`packages/web/assets/scss/`). Compile to CSS at build time (dart-sass in dev/CI or `grass` in build.rs). Port existing admin/settings CSS patterns; avoid inline styles except dynamic layout. |
| **Dynamics** | **Rust for all page logic** — forms, tables, wizards, policy editors, validation. Minimal JS: Mapbox GL only (Task 28); **no** React iframe bridge after Task 28.13. |
| **Fullstack** | Dioxus **fullstack** (SSR/hydration where it helps auth shell + admin lists); Axum serves API + static/web bundle on `:3003` dev, `:3001` prod. |
| **Shared core** | `packages/web` library crate: components, API client, auth session — reused by desktop/mobile crates later. |
| **Admin-first for Axum** | New Axum capabilities (policy versions, ABAC reload, system tokens) get **admin UI in Task 22**, not bolted onto a single “convert everything” task. |
| **Platform order** | **Web fullstack → desktop → mobile**, all on `feature/axum-migration` until final merge. |
| **Public landing + platform UX** | Task 24 ports **full** React SaaS (landing, wizard, post-login workspace entry) — not marketing-only. |
| **Access control** | Task 23.5 seeds Express MATRIX + default ABAC policy **per tenant**; Dioxus gates by permission within active tenant. |
| **Browser E2E** | Task 25 Playwright includes role-matrix allow/deny cases. |

---

## Phase A — Task 19: Admin API surface (before Dioxus)

Backend-only. Expose HTTP handlers for use cases that exist in application/infrastructure but lack routes (or lack admin-specific operations).

| Iteration | Deliverable |
|-----------|-------------|
| **19.1** | Policy version routes: `GET/POST /api/rbac/policies`, `GET/PATCH/DELETE …/{id}`, `POST …/{id}/activate` wired to `PolicyRepository` use cases |
| **19.2** | Policy reload hook: invalidate tenant cache on activate (extends Task 15 `PolicyReloadService`) |
| **19.3** | Admin route catalog entries + integration tests for policy CRUD smoke |
| **19.4** | Document admin API matrix in [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md) |

**Exit criteria:**

- All policy use cases reachable via Axum with RBAC guards (`policy.*` mapping)
- `route_catalog` + golden updated
- React can optionally call new routes for interim testing; **Dioxus admin UI lands in Task 22**

---

## Phase B — Tasks 20–23: Dioxus fullstack web

### Task 20 — Foundation (SCSS + workspace + fullstack dev) ✅

| Iteration | Deliverable |
|-----------|-------------|
| **20.1** | `packages/web` Dioxus **0.7.9** fullstack crate; `Cargo.toml` features: `web`, later `desktop`, `mobile` |
| **20.2** | SCSS pipeline: `assets/scss/_tokens.scss`, `_admin.scss`, build script or `build.rs` → `dist/css/` |
| **20.3** | Dev script: Axum `:3003` + Dioxus dev server; proxy `/api` |
| **20.4** | Shared Rust modules: `api_client`, `auth_session`, `error_display` |
| **20.5** | Design tokens aligned with current admin CSS (glass panels, badges, lifecycle steps) |

**Exit criteria:** `cargo run -p geosyntra-web` serves styled shell; SCSS compiles in CI.

### Task 21 — Auth + app shell ✅

| Iteration | Deliverable |
|-----------|-------------|
| **21.1** | Login flow against Axum (`/api/auth/login`); register/verify deferred to Task 22+ |
| **21.2** | JWT session in Rust; `/api/rbac/me` restore on startup |
| **21.3** | App layout: sidebar, nav, owner gate — Rust components + `_auth.scss` |
| **21.4** | `Router` + protected routes (`/`, `/login`, `/admin`); localStorage persistence on wasm |

**Exit criteria:** Bootstrap admin login works without React; session persists across refresh (wasm web).

**Implemented:** `packages/web/src/auth_api.rs`, `auth_session.rs`, `routes.rs`, `pages/*`, `components/layout.rs`.

### Task 22 — Admin console ✅

**Shipped:** policy versions CRUD + activate, user lifecycle, system token status, team invites, roles matrix, audit log.

| Area | Dioxus pages | Axum routes | Status |
|------|--------------|-------------|--------|
| **Policy versions** | `/admin/policies`, `/admin/policies/:id` | Task 19 policy routes | ✅ |
| **User management** | `/admin/users` | `/api/rbac/users/*` | ✅ |
| **System tokens** | `/admin/tokens` | `/api/system/tokens/status` | ✅ |
| **Team & invites** | `/admin/team` | `/api/rbac/invites/*` | ✅ |
| **Roles & matrix** | `/admin/roles` | `/api/rbac/permissions/matrix` | ✅ |
| **Audit log** | `/admin/audit` | `/api/rbac/audit` | ✅ |
| **Billing admin** | `/admin/billing` | `/api/billing/*` | P2 |
| **Platform config** | `/admin/platform` | `/api/config/*` | P2 |
| **Overview** | `/admin` | — | ✅ hub tiles |

**Exit criteria:**

- [x] Policy version CRUD + activate works in Dioxus against Task 19 routes
- [x] Owner can complete user approve/suspend/reactivate without React
- [x] System tokens page owner-gated (registry status)
- [x] Team invites, roles matrix, and audit log pages wired to Axum
- [x] SCSS builds in CI; admin tables/badges styled
- [x] Admin route map documented below

**Dioxus admin routes:**

| Path | Component |
|------|-----------|
| `/admin` | Overview hub |
| `/admin/policies` | Policy version list + create |
| `/admin/policies/:id` | Rule editor, save, activate, delete |
| `/admin/users` | User directory + lifecycle actions |
| `/admin/team` | Invites + pending approval |
| `/admin/roles` | Permission matrix viewer |
| `/admin/audit` | Audit log table |
| `/admin/tokens` | Token registry status (owner) |
| `/admin/tenants` | Tenant directory + governance propose |
| `/admin/memberships` | Cross-tenant membership CRUD |
| `/admin/grants` | Temporary grants |
| `/admin/platform` | Platform config + runtime status |
| `/admin/governance` | Approval inbox (≥3 admins) |

**Rust modules:** `packages/web/src/api/admin/*`, `pages/admin/*`, `components/admin/shell.rs`, `assets/scss/admin/_admin.scss`.

### Task 23 — Operational UI ✅

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **23.1** | Settings shell + API integrations status page | ✅ |
| **23.2** | Map/geo bridge at `/satellite` (iframe to legacy map when same-origin) | ✅ interim — **superseded by Task 28** |
| **23.3** | Dashboard hub + `/join-team` invite accept | ✅ |
| **23.4** | Axum static middleware serves Dioxus `dx` bundle (`GEOSYNTRA_WEB_DIST`) | ✅ |

**Dioxus routes added:**

| Path | Component |
|------|-----------|
| `/settings` | Settings overview |
| `/settings/profile` | Profile |
| `/settings/api-integrations` | Platform token status (owner) |
| `/satellite` | GeoAI workspace bridge |
| `/join-team?token=` | Accept team invite |

**Exit criteria:**

- [x] Signed-in users reach settings and profile without React
- [x] Owner can review API integration status from Axum config routes
- [x] Invite accept flow works via Dioxus
- [x] Axum serves Dioxus production bundle when built

### Task 23.5 — Access control parity (RBAC + ABAC bootstrap) ✅

Seed Express role permissions and default **resource + action** ABAC policy on first API start; Dioxus gates by permission slugs within active tenant.

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **23.5.1** | `seed_default_abac_policy()` — activate `express-baseline-v1` from MATRIX | ✅ |
| **23.5.2** | Idempotent call from `prepare_database()` | ✅ |
| **23.5.3** | `/api/rbac/me` returns `permissions[]` | ✅ |
| **23.5.4** | Dioxus `AuthSession::has_permission()` | ✅ |
| **23.5.5** | Admin/settings/satellite gates by slug (not owner-only) | ✅ |
| **23.5.6** | Integration tests per role (trial/manager/owner) | ✅ |
| **23.5.8–23.5.12** | **Tenant isolation** — JWT tenant, session, UI chrome, cross-tenant 403 tests | ✅ |

**Detail:** [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)

**Exit criteria:** Fresh DB bootstraps MATRIX + active ABAC policy; trial_user vs owner UI/routes match Express; **tenant isolation** enforced.

### Task 23.6 — Redis auth & session cache 🔲

Reduce Postgres load on every authenticated request; shared cache for multi-instance VPS.

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **23.6.1** | `SessionCache` port + `REDIS_URL` + `scripts/dev-redis.sh` | Scaffold |
| **23.6.2** | `CachingSubjectContextResolver` (session, membership, role) | Pending |
| **23.6.3** | Redis-backed active policy cache (replaces in-memory only) | Pending |
| **23.6.4** | Invalidation on role change, policy activate, suspend | Pending |
| **23.6.5** | Platform config cache (`/api/config/status`) | Pending |
| **23.6.6** | Integration tests + latency baseline | Pending |

**Detail:** [redis-auth-cache-plan.md](./redis-auth-cache-plan.md)

**Exit criteria:** Cache hit avoids membership/role SQL; noop when `REDIS_URL` unset; invalidation correct across tenants.

### Task 24 — Full SaaS platform parity (React → Dioxus) ✅

**All old React functionality** (landing, wizard, post-login platform access, trial/billing) **plus** existing Task 23 admin/operational UI.

| Phase | Iterations | Status |
|-------|------------|--------|
| **A — Routing + workspace** | 24.1–24.3 public paths, workspace state, `resolve_auth_plan_route` | ✅ |
| **B — Landing + wizard UI** | 24.4–24.10 nav, ScrollGlobe, wizard, OAuth, Stripe | ✅ |

**Detail:** [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md)

**Exit criteria:** Guest landing; signed-in workspace entry to `/satellite` (bridge); permissions from 23.5 enforced. **Full map → Task 28.**

### Task 28 — Full interactive GIS map in Dioxus ✅ MVP

Replace React iframe bridge with native Mapbox workspace at `/satellite/indices` — AOI, layers, indices, analysis chrome.

| Phase | Iterations | Status |
|-------|------------|--------|
| **A — Map shell** | 28.1–28.4 routes, Mapbox mount, responsive shell | ✅ |
| **B — AOI core** | 28.5–28.7 draw, list, persist (localStorage) | ✅ MVP |
| **C — Layers & indices** | 28.8–28.10 layer control, WMS stub, identify | ✅ MVP |
| **D — Analysis** | 28.11–28.12 charts strip, GeoAI shell | ✅ shell |
| **E — Bridge removal** | 28.13–28.15 no React iframe; Playwright map spec | ✅ |
| **F — Shell polish** | 28.16 unified `AppNavBar` on landing, dashboard, GIS | ✅ |

**Detail:** [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)

**Exit criteria:** Interactive map on `:8080` without Vite `:5173`; Start → `/satellite/indices` with live Mapbox canvas.

### Task 25 — Playwright E2E (Dioxus web) ✅

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **25.1** | `e2e/dioxus` + `playwright.config.ts` | ✅ |
| **25.2** | Wasm hydration + public landing specs | ✅ |
| **25.3** | Auth fixture + workspace session persist after reload | ✅ |
| **25.4** | Admin console specs | ✅ |
| **25.5** | Settings + join-team specs | ✅ |
| **25.6** | Responsive viewport matrix | ✅ |
| **25.7** | Role matrix + tenant isolation + CI job | Specs ✅; CI `dioxus-e2e.yml` |
| **25.8** | CI Playwright job | Added — verify on PR |
| **25.9** | Map workspace spec (Task 28) | ✅ |

**Detail:** [dioxus-playwright-e2e-plan.md](./dioxus-playwright-e2e-plan.md)

**Run:**

```bash
bash scripts/dev-dioxus-with-axum.sh
bash scripts/run-dioxus-playwright.sh
```

### Task 26 — Fullstack web E2E + staging ✅

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **26.1** | API integration tests (`/api/config/status`) | ✅ |
| **26.2** | `scripts/smoke-dioxus-web.sh` (SSR + wasm + admin API) | ✅ |
| **26.3** | Staging on Hostinger `:3003` | Local fallback ✅ — `scripts/run-local-staging-smoke.sh`; VPS SSH blocked |
| **26.4** | `migration/e2e-signoff-checklist.md` + `scripts/run-task-26-signoff.sh` | ✅ |

**Run:**

```bash
bash scripts/run-task-26-signoff.sh
bash scripts/run-local-staging-smoke.sh   # release curl smoke + debug Playwright on :3004
```

### Task 27 — Deploy hardening (feature branch only, no merge)

| Step | Action |
|------|--------|
| **27.0** | Release wasm hydration on Axum SSR; Playwright on release bundle |
| **27.0-dev** | Mapbox local dev proxy for URL-restricted tokens |
| **27.2** | Dioxus web static bundle deploy script (`deploy-dioxus-production.sh`) |
| **27.3** | Express retirement docs (when applicable) |
| **27.4** | Rollback runbook ([nix-deploy-hostinger.md](./nix-deploy-hostinger.md)) |

**Exit criteria:** Release bundle and deploy scripts validated on feature branch staging.

---

## Phase D — Tasks 29–30: Desktop (feature branch, before merge)

| Task | Deliverable |
|------|-------------|
| **29** | `packages/desktop` — Dioxus desktop binary; reuse `packages/web` components; native shell, file paths, offline-tolerant admin views |
| **30** | Desktop-specific flows (system token import, policy export file); desktop E2E smoke |

**Exit criteria:** Desktop app installs and runs core admin workflows against production or staging API.

---

## Phase E — Tasks 31–32: Mobile (feature branch, before merge)

| Task | Deliverable |
|------|-------------|
| **31** | Dioxus mobile / PWA target; responsive SCSS breakpoints; touch-first admin **read** views |
| **32** | Mobile E2E; optional app store packaging deferred to later task if needed |

**Exit criteria:** Mobile web/PWA usable for dashboard + admin read paths; write ops validated on case-by-case basis.

---

## Phase G — Task 33: Platform governance (active)

Full admin CRUD, **Geosyntra** platform super-tenant, and **≥3-admin quorum** for policy/tenant changes.

**Detail:** [dioxus-governance-plan.md](./dioxus-governance-plan.md)

| Iteration | Deliverable |
|-----------|-------------|
| **33.1** | Platform tenant bootstrap (`Geosyntra`, `is_platform_tenant`) + `platform.*` permission slugs |
| **33.7–33.8** | `governance_proposals` schema, approval API, audit, dedup, review window |
| **33.2–33.6** | Dioxus CRUD: tenants, memberships, users, grants, platform config |
| **33.9–33.10** | Integration + Playwright quorum specs |

**Exit criteria:** No direct policy activate or tenant create without quorum; all governance steps in `admin_audit`; admin nav includes governance inbox with pending badge.

**Follow-up — Task 34:** Table-first lists, multi-step modals for create/edit/propose, detail modals for view; **no JSON textareas** in Dioxus admin. See [dioxus-admin-console-plan.md § Task 34](./dioxus-admin-console-plan.md#task-34--admin-table--stepper-modal-ui).

---

## Dev commands

**Interim (React + Axum, until Task 20):**

```bash
# Terminal 1
export DATABASE_URL=postgres://geosyntra:geosyntra@127.0.0.1:5433/geosyntra_dev
export JWT_SECRET=geosyntra-dev-jwt-secret RBAC_JWT_SECRET=geosyntra-dev-jwt-secret
export GEOSYNTRA_API_PORT=3003 GEOSYNTRA_ENV=development
cargo run -p geosyntra-api

# Terminal 2
cd frontend && npm run dev:client:clean
```

**Target (Task 20+, fullstack web):**

```bash
bash scripts/dev-dioxus-with-axum.sh   # daily driver — :8080 + :3003
# Task 28: GIS map on same stack (no Vite after 28.13)
# Interim until Task 28: bash scripts/dev-full-platform.sh  # adds React :5173 iframe
```

**Desktop / mobile (Tasks 29+, after Task 27):**

```bash
cargo run -p geosyntra-desktop
cargo run -p geosyntra-mobile --target wasm32-unknown-unknown
```

---

## References

- [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)
- [redis-auth-cache-plan.md](./redis-auth-cache-plan.md)
- [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md)
- [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)
- [dioxus-playwright-e2e-plan.md](./dioxus-playwright-e2e-plan.md)
- [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md)
- [axum-migration-plan.md](./axum-migration-plan.md)
- [rbac-use-case-mapping.md](./rbac-use-case-mapping.md)
- [clean-architecture-guidelines.md](./clean-architecture-guidelines.md)
