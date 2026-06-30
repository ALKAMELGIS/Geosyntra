# Dioxus Playwright E2E (Task 25)

**Goal:** Browser E2E for Dioxus fullstack — public landing (Task 24), post-login platform entry, **GIS map workspace** (Task 28), **role permission matrix** (Task 23.5), admin, settings.

**Status:** ✅ **46 specs pass locally** (2026-06-17) including map workspace (`map-workspace.spec.ts`) and admin stepper modals (`admin-crud-forms.spec.ts`). CI job in `dioxus-e2e.yml`.

**Index:** [dioxus-axum-plan.md](./dioxus-axum-plan.md) · [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md) · [dioxus-saas-platform-plan.md](./dioxus-saas-platform-plan.md) · [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)

---

## Layout

```
e2e/dioxus/
  package.json
  playwright.config.ts
  tests/
    landing-public.spec.ts      # Task 24 — guest /
    landing-wizard-auth.spec.ts # wizard sign-in
    dashboard.spec.ts           # signed-in hub
    admin-console.spec.ts       # owner admin paths
    settings.spec.ts
    tenant-isolation.spec.ts     # Task 25 — dashboard/settings/admin tenant scope
    role-matrix.spec.ts          # Task 25.7 — trial vs manager vs owner routes
    map-workspace.spec.ts        # Task 25.9 — Start → /satellite/indices + Mapbox canvas (Task 28)
  fixtures/
    auth.ts                     # login helper via UI or API
```

**Run:**

```bash
bash scripts/dev-dioxus-with-axum.sh   # terminal 1 — or reuse running stack
bash scripts/run-dioxus-playwright.sh  # terminal 2
```

---

## Task 25 iterations

| Iteration | Deliverable | Status |
|-----------|-------------|--------|
| **25.1** | `e2e/dioxus` workspace + `playwright.config.ts` (`baseURL` `:8080`) | Done |
| **25.2** | `wasm-hydration.spec.ts` + `landing-public.spec.ts` | Done |
| **25.3** | Auth fixture + `dashboard.spec.ts` + session persist after reload | Done |
| **25.4** | `admin-console.spec.ts` — policies, users, team, roles, audit, tokens | Done |
| **25.5** | `settings.spec.ts` + owner API integrations page | Done |
| **25.6** | Responsive matrix (320 / 768 / 1200 / 3840) — port patterns from `frontend/tests/home-grid.spec.ts` | Done |
| **25.7** | `role-matrix.spec.ts` + `tenant-isolation.spec.ts` + CI Playwright job | Specs done; CI in `dioxus-e2e.yml` |
| **25.9** | `map-workspace.spec.ts` — owner login → Start → map shell on `/satellite/indices` | Done |

### Task 34 — Admin modal flows (extends 25.4)

After Task 34 refactors admin pages to table + stepper modals:

| Spec | Covers |
|------|--------|
| `admin-modal-users.spec.ts` | Create user stepper; view detail modal |
| `admin-modal-tenants.spec.ts` | Propose create stepper; structured config (no JSON textarea) |
| Update `admin-crud-forms.spec.ts` | Open modals via table actions; assert `[role=dialog]` steps |

Use `bash scripts/run-playwright-with-logs.sh` (cold restart + log tail) per commit-test cycle.

---

## Config conventions

| Setting | Value |
|---------|--------|
| `baseURL` | `http://127.0.0.1:8080` (override: `GEOSYNTRA_WEB_URL`) |
| `webServer` | Reuse existing server (`reuseExistingServer: true`) — stack started by dev script |
| Browsers | chromium required; firefox/webkit optional (match React config) |
| Credentials | `SMOKE_EMAIL` / `SMOKE_PASSWORD` (default admin dev owner) |

**API seeding:** prefer UI login; optional `request` fixture POST to `:3003/api/auth/login` for faster admin setup.

---

## Relationship to other gates

| Gate | Layer | Task |
|------|-------|------|
| `scripts/smoke-dioxus-web.sh` | curl + jq | 26.2 |
| `run-api-integration-tests.sh` | Rust + Postgres | 26.1 |
| **Playwright** | Browser UX + wasm | **25** |
| Manual checklist | Human sign-off | [e2e-signoff-checklist.md](./e2e-signoff-checklist.md) |

React Playwright (`frontend/playwright.config.ts`, port **5177**) remains for regression until Task 27 cutover; Dioxus suite is the **cutover gate** for web.

---

## Exit criteria

- [x] `bash scripts/run-dioxus-playwright.sh` passes locally (chromium, 18 specs)
- [x] Admin + settings specs cover all Task 22–23 routes
- [x] Landing specs cover public `/` (no login wall) after Task 24.1
- [x] Role-matrix + tenant-isolation specs enabled (Task 25.7)
- [x] Documented in [e2e-signoff-checklist.md](./e2e-signoff-checklist.md)
- [x] CI workflow runs Playwright on `feature/axum-migration` (`dioxus-e2e.yml`)
- [x] **Task 25.9 / 28** — Map workspace spec green without React `:5173`

---

## References

- React reference: `frontend/tests/home-grid.spec.ts`, `frontend/playwright.config.ts`
- Smoke: `scripts/smoke-dioxus-web.sh`
