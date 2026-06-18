# Axum migration plan (Tasks 0–32)

**Branch:** `feature/axum-migration`  
**Active branch:** `feature/axum-migration` — Axum `:3003` + Dioxus fullstack  
**No merge milestone:** production cutover and merge-to-`main` steps removed from the roadmap.

Latest audit: [pre-task-audit-16.md](./pre-task-audit-16.md)

## Branch policy

**All work stays on `feature/axum-migration`.** There is **no merge to `main`** — the feature branch is the sole deployment line (~90 commits ahead of `main`; intentional). Deploy hardening (Task 27.0–27.4) runs on the feature branch only. See [task-execution-workflow.md](./task-execution-workflow.md).

## Execution priority — GeoSyntra (GOS)

**Tasks 23.5, 25, 28, 33, and 34 are ✅ complete** on this branch. **Next:** Task **27.2–27.4** deploy/rollback validation (27.0 release wasm + Mapbox proxy ✅). Optional **28.8+** GIS parity and **23.6** Redis cache remain parallel.

| Phase | Tasks | Deliverable |
|-------|-------|-------------|
| **Done** | 0–18 | Domain → API foundation |
| **A — API admin** | 19 | Axum admin HTTP surface |
| **B — Dioxus operational** | 20–23 | Admin + settings + satellite hub |
| **B2 — Access + cache** | 23.5–23.6 | RBAC/ABAC per tenant + Redis cache |
| **B3 — SaaS UX** | 24 | Full platform parity |
| **B5 — GIS map** | **28** | Full interactive map in Dioxus | ✅ MVP |
| **B4 — Browser E2E** | 25 | Playwright | ✅ 46 specs local |
| **C — Deploy hardening** | 26–27 (27.0 ✅; 27.2–27.4) | Staging + release scripts (no merge) | ▶ 27.2 active |
| **D — Desktop** | 29–30 | Dioxus desktop app | |
| **E — Mobile** | 31–32 | Dioxus mobile / PWA | |
| **G — Governance** | **33** | Admin CRUD + Geosyntra super-tenant + 3-admin quorum | ✅ |
| **H — Admin UI** | **34** | Table + stepper modals (no JSON forms) | ✅ |

Detailed Dioxus phases: [dioxus-axum-plan.md](./dioxus-axum-plan.md)

## Task summary

| ID | Layer | Task | Status |
|----|-------|------|--------|
| 0–11 | Domain → Infra | Workspace, CA, sqlx, JWT, repos | ✅ |
| 12 | Interface | Auth shell, JWT bridge, composition | ✅ |
| 13 | Interface | RBAC user handlers | ✅ |
| 14 | Interface | Audit/invites/matrix, CORS, rate limit | ✅ |
| 15 | API | Reloadable ABAC, billing read routes | ✅ |
| **16** | Interface/API | **Billing lifecycle** (`start-trial`, `activate`) | ✅ |
| **17** | **Deploy** | **Nix flake + deploy-rs → Hostinger Ubuntu VPS** | ✅ |
| **18** | API | Parity gate (route catalog + golden inventory) | ✅ |
| **19** | API | **Admin HTTP surface** (policy versions + Axum-only ops) | ✅ |
| **20** | Web | **Dioxus fullstack foundation** (SCSS, workspace, dev pipeline) | ✅ |
| **21** | Web | **Auth + app shell** (Rust UI logic, session, routing) | ✅ |
| **22** | Web | **Admin console** (policy versions, RBAC, tokens, billing admin) | ✅ |
| **23** | Web | **Operational UI** (settings, geo/map bridge, integrations) | ✅ |
| **23.5** | API + Web | **Access control + tenant isolation** (RBAC/ABAC per tenant, permission gates) | ✅ |
| **23.6** | Infra/API | **Redis cache** (session, role, tenant, policy — reduce auth-path SQL) | 🔲 optional |
| **24** | Web | **Full SaaS platform parity** (React landing + post-login + keep admin UI) | ✅ |
| **28** | Web | **Full interactive GIS map** (Mapbox + AOI + layers — replace iframe bridge) | ✅ MVP |
| **25** | QA | **Playwright E2E** (Dioxus browser suite + role matrix + map workspace) | ✅ 46 specs local |
| **26** | QA | **Staging + curl/Rust E2E sign-off** | ✅ local; VPS SSH optional |
| **27** | Deploy | **Release hardening** (wasm SSR, Mapbox proxy, deploy scripts, rollback docs) | ▶ active |
| **29** | Desktop | **Dioxus desktop shell** + core admin workflows | |
| **30** | Desktop | **Desktop parity + testing** | |
| **31** | Mobile | **Dioxus mobile shell** + responsive core | |
| **32** | Mobile | **Mobile parity + testing** | |
| **33** | API + Web | **Platform governance** (full admin CRUD, Geosyntra super-tenant, ≥3-admin quorum, audit) | ✅ |
| **34** | Web + QA | **Admin table + stepper modals** (no JSON forms) | ✅ |

## Task 17 — Nix deploy (Hostinger VPS)

**Deliverables:**

1. `flake.nix` — `deploy-rs` input, `packages.geosyntra-api`, `deploy.nodes.hostinger-vps`
2. `nix/packages.nix` — `buildRustPackage` for workspace binary
3. `nix/deploy-hostinger.nix` — deploy-rs profile + systemd activation
4. `scripts/install-nix-hostinger.sh` — Determinate Nix installer for Ubuntu VPS
5. `migration/nix-deploy-hostinger.md` — operator runbook
6. `GEOSYNTRA_BIND_HOST` — API binds `0.0.0.0` in production

**Exit criteria:** `nix flake check` passes; `nix build .#geosyntra-api` succeeds; deploy node documented.

## Task 16 — Billing lifecycle

**Routes:**

- `POST /api/billing/start-trial`
- `POST /api/billing/activate`

**Use cases:** `StartBillingTrialUseCase`, `ActivateBillingPlanUseCase`  
**Port:** `SubscriptionRepository` write methods + Postgres impl

## Task 18 — Parity gate ✅

**Delivered:**

1. `packages/interface/src/route_catalog.rs` — canonical implemented routes (**132 routes**)
2. `migration/axum-route-inventory.golden` — CI golden file
3. `packages/interface/tests/route_parity.rs` — catalog ↔ golden sync test
4. `scripts/check-route-parity.sh` — coverage stats vs Express inventory
5. `scripts/generate-route-inventory.sh` — marks implemented routes in Express inventory
6. **`packages/api/tests/api_integration.rs`** — modular HTTP suites (public, RBAC, billing, route smoke) vs live Axum + Postgres
7. **`scripts/run-api-integration-tests.sh`** — bootstrap Postgres + run suite (`--test-threads=1`, shared server)
8. Stripe live calls when `STRIPE_SECRET_KEY` is set (`packages/interface/src/billing/stripe.rs`)
9. Billing lifecycle: `confirm-payment`, `bank-transfer`, payment-intent, checkout-session
10. System + user token route stubs (`/api/system/tokens/*`, user token PUT/DELETE)
11. `POST /api/log/client`
12. Platform + auth public/lifecycle routes
13. Static SPA middleware
14. Staging deploy profile on `:3003`
15. Response parity script: `scripts/compare-api-parity.sh`
16. Axum response golden: `migration/axum-response-golden.tsv` + `packages/api/tests/response_golden.rs`
17. Express response golden: `migration/express-response-golden.tsv` + record/verify scripts + optional ignored test
18. Config/gateway status stubs

**Run integration tests:**

```bash
scripts/dev-postgres.sh start
scripts/run-api-integration-tests.sh
```

**Express golden (optional, Express on :3001):**

```bash
scripts/verify-express-response-golden.sh
# cargo test -p geosyntra-api --test express_response_golden -- --ignored
```

## Task 19 — Admin API surface ✅

Policy version HTTP routes on Axum (Task 19.1–19.3):

| Method | Path |
|--------|------|
| `GET` | `/api/rbac/policies` |
| `POST` | `/api/rbac/policies` |
| `GET` | `/api/rbac/policies/{id}` |
| `PATCH` | `/api/rbac/policies/{id}` |
| `DELETE` | `/api/rbac/policies/{id}` |
| `POST` | `/api/rbac/policies/{id}/activate` |

Wired to policy use cases with tenant policy reload on activate. Route catalog: **132 routes** (includes Task 33 governance + platform CRUD).

See [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md) for Task 22 admin UI scope.

## Task 20 — Dioxus foundation ✅

| Iteration | Deliverable |
|-----------|-------------|
| **20.1** | `packages/web` Dioxus **0.7.9** fullstack crate (`web`, `desktop`, `mobile`, `server` features) |
| **20.2** | SCSS pipeline (`assets/scss/` → `assets/css/app.css` via `build.rs` + grass) |
| **20.3** | `scripts/dev-dioxus-with-axum.sh` — Axum `:3003` + Dioxus SSR `:8080` |
| **20.4** | Shared modules: `api_client`, `auth_session`, `error_display`, `components/shell` |
| **20.5** | Design tokens from admin CSS (`_tokens.scss`, `_layout.scss`, `admin/_shell.scss`) |

**Run:**

```bash
bash scripts/dev-dioxus-with-axum.sh
# Fullstack (wasm hydration): dx serve from packages/web
# SSR-only fallback: cargo run -p geosyntra-web --features server
```

**Fullstack fix:** `packages/web` is a single Dioxus fullstack crate (`server = ["dioxus/server"]`, `web = ["dioxus/web"]`). `dx serve --platform web` builds wasm client + native server separately; wasm uses `gloo-net`, native SSR uses `reqwest`.

## Task 21 — Dioxus auth + app shell ✅

| Iteration | Deliverable |
|-----------|-------------|
| **21.1** | Login against Axum; JWT session + `/api/rbac/me` restore |
| **21.2** | Router (`/`, `/login`, `/admin`); protected routes + owner gate |
| **21.3** | App layout (sidebar/nav); auth SCSS; localStorage on wasm |

**Dev login:** `admin@geosyntra.com` / `GeoSyntra-Admin-2026!`

## Task 22 — Dioxus admin console ✅

| Page | Path | Axum API |
|------|------|----------|
| Overview | `/admin` | — |
| Policy versions | `/admin/policies`, `/admin/policies/:id` | `/api/rbac/policies/*` |
| Users | `/admin/users` | `/api/rbac/users/*` |
| Team & invites | `/admin/team` | `/api/rbac/invites/*` |
| Roles & matrix | `/admin/roles` | `/api/rbac/permissions/matrix` |
| Audit log | `/admin/audit` | `/api/rbac/audit` |
| System tokens | `/admin/tokens` | `/api/system/tokens/status` |

P2 pages (billing admin, policy diff) remain for follow-up.

**Task 34 ✅:** Admin pages use **table + stepper/detail modals**; JSON textareas removed — see [dioxus-admin-console-plan.md § Task 34](./dioxus-admin-console-plan.md#task-34--admin-table--stepper-modal-ui).

## Task 23 — Operational UI ✅

| Area | Path | Notes |
|------|------|-------|
| Dashboard hub | `/dashboard` (Task 24 moves from `/`) | Quick links to GeoAI, settings, admin |
| Settings | `/settings`, `/settings/profile` | Profile + overview |
| API integrations | `/settings/api-integrations` | Owner read-only `/api/config/status` |
| Join team | `/join-team?token=…` | Public invite accept flow |
| GeoAI workspace | `/satellite/indices` | **Task 28:** native Dioxus Mapbox map (iframe bridge removed) |
| Static UI | Axum fallback | Prefers `target/dx/geosyntra-web/*/web/public` over Vite dist |

**Dev:** `bash scripts/dev-dioxus-with-axum.sh` — daily driver; React Vite no longer required for core journeys.

## Phases B–E (Tasks 24–32)

See [dioxus-axum-plan.md](./dioxus-axum-plan.md) for iteration breakdown, styling rules, and exit criteria.

**Summary:**

| Phase | Tasks | Focus |
|-------|-------|--------|
| **A** | 19 | Axum admin API routes (policy versions, reload hooks) before any React→Dioxus UI work |
| **B** | 20–23 | Dioxus **fullstack web**: SCSS pipeline, Rust-first dynamics, admin console, operational pages |
| **B2** | 23.5–23.6 | **RBAC/ABAC + tenant isolation** + **Redis** session/role/policy cache |
| **B3** | 24 | **Full React SaaS UX** (landing, post-login, trial) + keep admin UI |
| **B5** | **28** | **Full interactive GIS map** in Dioxus — ✅ MVP complete |
| **B4** | 25 | **Playwright** browser E2E + role/tenant matrix + map workspace |
| **C** | 26–27 | Staging sign-off → **production cutover** (Express retired) |
| **D** | 29–30 | Dioxus **desktop** after web cutover |
| **E** | 31–32 | Dioxus **mobile** last |

## References

- [dioxus-axum-plan.md](./dioxus-axum-plan.md)
- [redis-auth-cache-plan.md](./redis-auth-cache-plan.md)
- [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)
- [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md)
- [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)
- [dioxus-playwright-e2e-plan.md](./dioxus-playwright-e2e-plan.md)
- [dioxus-admin-console-plan.md](./dioxus-admin-console-plan.md)
- [clean-architecture-guidelines.md](./clean-architecture-guidelines.md)
- [rbac-use-case-mapping.md](./rbac-use-case-mapping.md)
- [nix-deploy-hostinger.md](./nix-deploy-hostinger.md)
