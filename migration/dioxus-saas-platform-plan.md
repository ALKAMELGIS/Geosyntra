# Dioxus SaaS platform parity (Task 24)

**Goal:** Port the **full React SaaS entry experience** to Dioxus — **not marketing-only**. Includes public landing, onboarding wizard, **post-login platform access** (workspace entry, trial/billing, GeoAI workspace route), **and** the existing Task 23 operational UI (dashboard, admin, settings).

**GIS map:** Task 24 delivers **Start → `/satellite/indices`** (Task 28 native map). See [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md). Task 28 MVP ✅ complete.

**Prerequisite:** [Task 23.5 access control](./dioxus-access-control-plan.md) · [Task 23.6 Redis cache](./redis-auth-cache-plan.md) (recommended for Dioxus multi-request pages).

**React source of truth:** `frontend/src/pages/Home.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/onboarding/*`  
**Dioxus target:** `packages/web/src/pages/landing/*`, `packages/web/src/workspace/*`

**Index:** [dioxus-axum-plan.md](./dioxus-axum-plan.md) · [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md) · [dioxus-playwright-e2e-plan.md](./dioxus-playwright-e2e-plan.md)

---

## What “full parity” means

| Layer | React behavior | Dioxus must match |
|-------|----------------|-------------------|
| **Public landing** | Hero, pricing, footer, scroll globe | ✅ Visual + SCSS |
| **Guest auth** | Wizard sign-in / register / verify | ✅ Axum auth routes |
| **Post-login routing** | `resolveAuthPlanRoute()` → workspace / payment / trial | ✅ Rust workspace state |
| **Hero CTA** | `start` → `/satellite/indices`; `trial` → wizard | ✅ Permission + workspace check |
| **Workspace lifecycle** | trial / active / expired; `requiresUpgradeToPaid()` | ✅ localStorage + billing API |
| **Platform access** | `app.access` + `aoi.read` for GeoAI routes | ✅ Task 23.5 permissions |
| **Admin / settings** | Role MATRIX — not owner-only | ✅ Task 23.5 **per tenant** |
| **Tenant scope** | Single-tenant session today; membership `(user, tenant)` | ✅ `tenant_id` on session; UI isolation on dashboard/settings/admin |
| **Existing Dioxus admin** | Policies, users, tokens, etc. | ✅ **Keep** — additive |

---

## Routing model (after Task 24)

| Path | Audience | Tenant | Content |
|------|----------|--------|---------|
| **`/`** | Public (+ signed-in chrome) | — | Full React Home: nav, ScrollGlobe, pricing, wizard |
| **`/dashboard`** | `app.access` | **active tenant** | Operational hub; workspace/billing keyed by `(tenant_id, user)` |
| **`/satellite`** | `app.access`, `aoi.read` | **active tenant** | **Task 28:** native GeoAI map at `/satellite/indices` (Task 23.2 bridge interim) |
| **`/login`, `/app/auth/*`** | Public | — | Wizard on `/` (React redirect parity) |
| **`/admin/*`** | `admin.panel` + action slugs | **active tenant** | All admin lists/mutations scoped to `session.tenant_id` |
| **`/settings/*`** | `app.access`; integrations need `admin.settings.manage` | **active tenant** | Profile + tenant config only |
| **`/join-team`** | Public | target tenant from invite token | Invite accept binds membership to invite tenant |

**Auth gating (match React `isSaasPublicPath` + `ProtectedRoute`):**

```text
Public:  /, /app/auth/*, /app/billing/pricing, /app/onboarding/trial-start, /join-team
Protected: everything else → requires session + app.access (and route-specific slugs)
```

---

## Post-login flow (must port)

```mermaid
flowchart TD
  A[Login / OAuth / Register] --> B{resolveAuthPlanRoute}
  B -->|enter_workspace| C[ensurePlatformOwnerWorkspace optional]
  C --> D[/satellite/indices or /dashboard]
  B -->|activate_trial| E[POST /api/billing/start-trial]
  E --> D
  B -->|activate_provisioned| F[activatePreAuthorizedWorkspace]
  F --> D
  B -->|open_payment| G[Wizard pricing/payment step]
  G --> D
  B -->|email_unverified| H[Wizard verify step]
```

**Rust modules to add:**

| Module | Ports from |
|--------|------------|
| `workspace/state.rs` | `workspaceState.ts`, `activateWorkspace.ts` — **key by `(tenant_id, email)`** |
| `workspace/plan_route.rs` | `planSubscriptionFlow.ts` → `resolveAuthPlanRoute` |
| `workspace/hero_access.rs` | `homeHeroAccess.ts` → `resolveHomeHeroAccessMode` |
| `landing/wizard/` | `HomeOnboardingContext`, step components |

---

## Task 24 iterations

### Phase A — Routing + workspace (P0)

| Iteration | Deliverable |
|-----------|-------------|
| **24.1** | Public `/` vs protected routes; `/dashboard`; `public_paths.rs` |
| **24.2** | Workspace state (trial/active/expired) + billing API hooks |
| **24.3** | Post-login router (`resolve_auth_plan_route`) + hero access modes |

### Phase B — Landing UI (P0–P1)

| Iteration | Deliverable |
|-----------|-------------|
| **24.4** | Nav, hero, footer, pricing SCSS shell |
| **24.5** | ScrollGlobe scroll narrative |
| **24.6** | `HomeUserStatusBar` — guest + signed-in menus |
| **24.7** | Onboarding wizard: welcome/auth step |
| **24.8** | Pricing + trial + payment steps |
| **24.9** | OAuth callback + Stripe interop |
| **24.10** | Hash nav + wizard query params |

**Phase B status (2026-06-14):** 24.4–24.10 landed in Dioxus — `landing/` (nav, hero, footer, pricing, scroll globe, status bar), `onboarding/` wizard (welcome, pricing, payment, launch), OAuth query strip + Stripe billing hooks, hash nav + `?start=1&wizard=…` entry. Unit tests in `geosyntra-web --lib` (34 passing).

---

## Exit criteria

- [x] Guest at `/` sees full landing — **not** login wall (Task 24.1)
- [x] After login, user with active workspace reaches **`/satellite/indices`** (Start CTA; Task 28 native map)
- [x] Landing nav, hero, pricing, footer, scroll narrative shell (24.4–24.5)
- [x] Signed-in / guest status bar on landing (24.6)
- [x] Onboarding wizard: auth, pricing, trial activation, payment, launch (24.7–24.8)
- [x] OAuth callback query handling + Stripe checkout/activate API client (24.9)
- [x] Hash nav + wizard query params / session intent (24.10)
- [x] Trial user: limited permissions per MATRIX; can use satellite read, not admin manage (Playwright 25.7)
- [x] **Task 28** — Full interactive map at `/satellite/indices` (no React iframe)
- [x] Manager/admin/owner: admin/settings visibility matches permission slugs within tenant
- [x] Admin policy CRUD never surfaces another tenant's versions (Task 23.5 isolation)
- [x] Task 23 admin console **still works** — additive, tenant-scoped
- [x] Playwright Task 25/26: landing + post-login + role matrix + map workspace (46 specs)

---

## Estimated effort

| Scope | Duration |
|-------|----------|
| Phase A (routing + workspace + permissions 23.5) | 2–3 weeks |
| Phase B landing UI | 4–8 weeks |
| OAuth + Stripe | 2–3 weeks |

---

## References

- React: `frontend/src/pages/Home.tsx`, `frontend/src/lib/onboarding/`
- Access: [dioxus-access-control-plan.md](./dioxus-access-control-plan.md)
- GIS map: [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)
- MATRIX: [role-permission-matrix.md](./role-permission-matrix.md)
