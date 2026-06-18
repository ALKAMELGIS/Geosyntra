# E2E sign-off checklist (Tasks 25–27)

**Branch:** `feature/axum-migration` — all work stays on the feature branch (no merge milestone).

**Active priority:** Task **27** deploy hardening. Tasks **23.5, 25, 26 (local), 28 MVP, 33, and 34** are ✅ complete.

## Automated gates (CI / local)

| Check | Command | Pass criteria |
|-------|---------|---------------|
| Route parity | `bash scripts/check-route-parity.sh` | Catalog ↔ golden in sync |
| API integration | `bash scripts/run-api-integration-tests.sh` | All ignored suites green |
| Dioxus web smoke | `bash scripts/smoke-dioxus-web.sh` | SSR + wasm assets + admin API paths |
| **Task 26 sign-off** | `bash scripts/run-task-26-signoff.sh` | Unit + integration + local staging smoke |
| **Playwright (Dioxus)** | `bash scripts/run-playwright-with-logs.sh` | Cold restart + log tail + browser specs green (Task 33) |
| Local staging | `bash scripts/run-local-staging-smoke.sh` | Release curl smoke + debug Playwright on `:3004` |
| Axum response golden | `cargo test -p geosyntra-api --test response_golden -- --ignored` | Golden TSV match |
| Redis cache (optional) | `REDIS_URL=… bash scripts/run-api-integration-tests.sh` | Auth path tests pass with Redis |

## Playwright coverage (Task 25) ✅

Requires `bash scripts/dev-dioxus-with-axum.sh` → http://127.0.0.1:8080 (or local staging `:3004` via `run-local-staging-smoke.sh`)

- [x] Wasm bundle loads (`geosyntra-web.js`, `_bg.wasm` — 200)
- [x] Login form submits; hub loads after refresh (session persists)
- [x] Admin: policies, users, team, roles, audit, tokens
- [x] Settings: profile, API integrations (owner)
- [x] Public `/` shows landing without login wall; wizard sign-in works
- [x] GIS map workspace (`map-workspace.spec.ts`)
- [x] Responsive viewport matrix (`responsive-layout.spec.ts`)

## Manual browser sign-off (owner session)

Login: `admin@geosyntra.com` / `GeoSyntra-Admin-2026!`  
Dev stack: `bash scripts/dev-dioxus-with-axum.sh` → http://127.0.0.1:8080

- [ ] Network tab shows `/wasm/geosyntra-web.js` and `geosyntra-web_bg.wasm` (200)
- [ ] Login form submits; dashboard loads after refresh (session persists)
- [ ] **Task 24:** Guest at `/` sees React-equivalent landing; post-login **Start** reaches `/satellite`
- [x] **Task 28:** `/satellite/indices` shows interactive Mapbox map (no React iframe / no `:5173`)
- [x] **Task 24:** Trial user blocked from admin manage (Playwright role-matrix)
- [x] **Task 23.5:** Permissions from `/api/rbac/me` include `tenantId` + `permissions[]`; nav gated per tenant
- [ ] **Task 23.6:** Redis enabled on staging/VPS; cache hit reduces auth SQL (see [redis-auth-cache-plan.md](./redis-auth-cache-plan.md))
- [x] **Task 23.5:** Admin users/policies/audit show only active tenant data; cross-tenant API returns 403
- [ ] Dashboard/settings sidebar shows active tenant label
- [ ] `/admin/policies` — list loads; create draft; activate (or use existing)
- [ ] `/admin/users` — directory loads; lifecycle action on pending user (if seed has one)
- [ ] `/admin/team` — invite form renders; invitations table loads
- [ ] `/admin/roles` — permission matrix table loads
- [ ] `/admin/audit` — audit rows load
- [ ] `/admin/tokens` — registry status loads (owner)
- [ ] `/settings/profile` — session details visible
- [ ] `/settings/api-integrations` — platform capabilities table (owner)
- [ ] `/join-team?token=…` — invalid token shows error; valid dev invite accepts (optional)

## Staging (Task 26.3)

Hostinger VPS — Axum `:3003` per [nix-deploy-hostinger.md](./nix-deploy-hostinger.md) *(SSH timeout — use local fallback below)*:

- [ ] `GET /health` → `ok` on VPS
- [ ] `scripts/deploy-dioxus-staging.sh` on Hostinger
- [ ] TLS + CORS origins include staging app origin

**Local staging fallback (automated ✅):**

```bash
bash scripts/run-local-staging-smoke.sh
```

- [x] `bash scripts/build-dioxus-web.sh`; Axum serves bundle via `GEOSYNTRA_WEB_DIST`
- [x] Dioxus SSR fallback on Axum (hydration data injected; not static index-only)
- [x] `bash scripts/smoke-dioxus-web.sh` against `:3004` (release assets)
- [x] Playwright against `:3004` (debug wasm client + Axum SSR — release wasm hydration fix deferred to Task 27)

## Release readiness (feature branch)

- [x] **Task 33** — Geosyntra super-tenant, governance CRUD, ≥3-admin quorum, audit, dedup, review window
- [x] **Task 34** — Admin table + stepper modals; no JSON forms
- [x] **Task 23.5** — RBAC/ABAC per tenant; session tenant isolation
- [x] **Task 28** — GIS map MVP (native Mapbox; iframe bridge removed)
- [ ] **Task 28.8+** — Full layer/index parity (optional follow-up)
- [x] **Task 25** — Playwright green (46 specs: role-matrix + map workspace + governance + admin modals)
- [x] All automated gates green on `feature/axum-migration` (local)
- [ ] Manual checklist signed off
- [ ] Deploy scripts validated ([nix-deploy-hostinger.md](./nix-deploy-hostinger.md))

## References

- [dioxus-axum-plan.md](./dioxus-axum-plan.md) — Tasks 24–28, 25–27
- [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)
- [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)
- [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md)
- [dioxus-playwright-e2e-plan.md](./dioxus-playwright-e2e-plan.md)
- [api-integration-test-report.md](./api-integration-test-report.md)
