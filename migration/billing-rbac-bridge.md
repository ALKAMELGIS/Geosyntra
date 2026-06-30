# Billing plan gates vs RBAC permissions

Express separates **subscription plan gates** ([`checkPlan.js`](../backend/server/billing/checkPlan.js)) from **role permissions** ([`permissions.js`](../backend/server/rbac/permissions.js)).

Domain mirrors that split:

| Concern | Domain type | Example |
|---------|-------------|---------|
| Subscription tier + daily quota | `billing::GeoFeature` + `Subscription::gate_feature` | `GeoFeature::AiQuery` — free tier 10/day |
| Tenant feature flags + API rate | `tenant::Feature` + `TenantFeatureConfig::evaluate` | `Feature::ApiAccess` + `api_rate_limit` |
| Role permission | `PermissionSlug` → `Resource` + `Action` | `ai.run` → `ai_chat` + `run` |

## `ai.run` vs `GeoFeature::AiQuery`

| Layer | Check | When |
|-------|-------|------|
| RBAC | User role includes `ai.run` permission | Task 5a `SubjectContext::has_permission`; Task 5c engine policy |
| Billing | Plan allows `GeoFeature::AiQuery` and quota not exceeded | Task 8 / handler calls `TenantFeatureConfig::evaluate` |

Application use cases for GeoAI endpoints must run **both** checks (two-phase: authorize use case, then plan gate).

## `GeoFeature::Export` vs `reports.write`

- `GeoFeature::Export` — billing/plan gate for export capability (Pro+).
- `reports.write` — RBAC permission on analyst+ roles.
- Export endpoints require both where Express applies `checkPlan(EXPORT)` and permission middleware.

## Task 5a wiring

```text
POST /api/geo/grounding (AI)
  → JWT roleSlug → Membership → has_permission(ai.run)
  → TenantFeatureConfig.evaluate(AiQuery, usage)
  → UseCase executes
```

See also [role-permission-matrix.md](./role-permission-matrix.md) and [permission-slug-matrix.md](./permission-slug-matrix.md).
