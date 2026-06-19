# Express route inventory

Generated for Axum migration parity tests. Re-run:
`scripts/generate-route-inventory.sh`

Axum implemented count: 91

| Method | Path | Axum status |
|--------|------|-------------|
| `delete` | `/api/aoi/:id` | ✅ implemented |
| `delete` | `/api/gis/external-tables/:table/rows/:rowId` | pending |
| `delete` | `/api/gis/relationships/:id` | pending |
| `delete` | `/api/rbac/users/:id` | ✅ implemented |
| `delete` | `/api/user/api-tokens/:provider` | pending |
| `get` | `/api/aoi` | ✅ implemented |
| `get` | `/api/auth/${provider}/callback` | pending |
| `get` | `/api/auth/${provider}` | pending |
| `get` | `/api/auth/apple/callback` | ✅ implemented |
| `get` | `/api/auth/apple` | ✅ implemented |
| `get` | `/api/auth/email/status` | ✅ implemented |
| `get` | `/api/auth/events` | ✅ implemented |
| `get` | `/api/auth/me` | ✅ implemented |
| `get` | `/api/auth/oauth/config` | ✅ implemented |
| `get` | `/api/auth/verify-email` | ✅ implemented |
| `get` | `/api/billing/invoices` | ✅ implemented |
| `get` | `/api/billing/me` | ✅ implemented |
| `get` | `/api/billing/plans` | ✅ implemented |
| `get` | `/api/config/claude` | ✅ implemented |
| `get` | `/api/config/deepseek` | ✅ implemented |
| `get` | `/api/config/gemini` | ✅ implemented |
| `get` | `/api/config/graphhopper` | ✅ implemented |
| `get` | `/api/config/mapbox` | ✅ implemented |
| `get` | `/api/config/mapbox/public-token` | ✅ implemented |
| `get` | `/api/config/openai` | ✅ implemented |
| `get` | `/api/config/sentinel` | ✅ implemented |
| `get` | `/api/config/status` | ✅ implemented |
| `get` | `/api/ecph/entries/latest` | pending |
| `get` | `/api/esri-dashboards/:id` | pending |
| `get` | `/api/esri-dashboards` | pending |
| `get` | `/api/gateway/mapbox/geocoding` | ✅ implemented |
| `get` | `/api/gateway/mapbox/proxy` | ✅ implemented |
| `get` | `/api/gateway/mapbox/public-token` | ✅ implemented |
| `get` | `/api/gateway/sentinel/credentials` | ✅ implemented |
| `get` | `/api/gateway/status` | ✅ implemented |
| `get` | `/api/geo/:geoId/attributes` | pending |
| `get` | `/api/geo/:geoId/forms` | pending |
| `get` | `/api/geo/grounding/status` | ✅ implemented |
| `get` | `/api/geo/locations` | ✅ implemented |
| `get` | `/api/gis/external-tables` | pending |
| `get` | `/api/gis/external-tables/:table/rows` | pending |
| `get` | `/api/gis/external-tables/:table/schema` | pending |
| `get` | `/api/gis/relationships` | pending |
| `get` | `/api/github/events` | ✅ implemented |
| `get` | `/api/github/oauth/callback` | ✅ implemented |
| `get` | `/api/github/oauth/start` | ✅ implemented |
| `get` | `/api/github/repos/:owner/:repo/issues` | ✅ implemented |
| `get` | `/api/github/repos/:owner/:repo/pulls` | ✅ implemented |
| `get` | `/api/github/repos` | ✅ implemented |
| `get` | `/api/github/status` | ✅ implemented |
| `get` | `/api/google-3d-tiles-proxy` | ✅ implemented |
| `get` | `/api/google-3d-tiles/root.json` | ✅ implemented |
| `get` | `/api/mapbox-proxy` | ✅ implemented |
| `get` | `/api/platform/env-health` | ✅ implemented |
| `get` | `/api/platform/health` | ✅ implemented |
| `get` | `/api/platform/runtime` | ✅ implemented |
| `get` | `/api/rbac/audit` | ✅ implemented |
| `get` | `/api/rbac/invites` | ✅ implemented |
| `get` | `/api/rbac/invites/preview` | ✅ implemented |
| `get` | `/api/rbac/me` | ✅ implemented |
| `get` | `/api/rbac/permissions/matrix` | ✅ implemented |
| `get` | `/api/rbac/users` | ✅ implemented |
| `get` | `/api/system/api-secrets` | pending |
| `get` | `/api/system/api-vault/backup` | pending |
| `get` | `/api/system/api-vault` | pending |
| `get` | `/api/system/tokens` | pending |
| `get` | `/api/system/tokens/status` | pending |
| `get` | `/api/system/user-api-tokens/overview` | pending |
| `get` | `/api/user/api-tokens` | ✅ implemented |
| `get` | `/api/user/api-tokens/session` | ✅ implemented |
| `get` | `/api/v1/account/profile-extra` | ✅ implemented |
| `get` | `/api/v1/admin/directory/login-history` | pending |
| `get` | `/api/v1/admin/directory` | pending |
| `get` | `/api/v1/admin/directory/stats` | pending |
| `get` | `/api/weather/latest` | ✅ implemented |
| `get` | `*` | ✅ implemented |
| `patch` | `/api/rbac/users/:id` | ✅ implemented |
| `patch` | `/api/system/tokens/:name` | pending |
| `post` | `/api/ai/analyze` | ✅ implemented |
| `post` | `/api/ai/chat` | ✅ implemented |
| `post` | `/api/aoi` | ✅ implemented |
| `post` | `/api/auth/admin/provision-user` | pending |
| `post` | `/api/auth/apple/exchange` | ✅ implemented |
| `post` | `/api/auth/forgot-password` | ✅ implemented |
| `post` | `/api/auth/forgot-username` | ✅ implemented |
| `post` | `/api/auth/github/exchange` | ✅ implemented |
| `post` | `/api/auth/google/exchange` | ✅ implemented |
| `post` | `/api/auth/linkedin/exchange` | ✅ implemented |
| `post` | `/api/auth/login` | ✅ implemented |
| `post` | `/api/auth/logout-all` | ✅ implemented |
| `post` | `/api/auth/logout` | ✅ implemented |
| `post` | `/api/auth/oauth-upsert` | pending |
| `post` | `/api/auth/refresh` | ✅ implemented |
| `post` | `/api/auth/register` | ✅ implemented |
| `post` | `/api/auth/resend-verification` | ✅ implemented |
| `post` | `/api/auth/reset-password` | ✅ implemented |
| `post` | `/api/auth/send-verification-email` | ✅ implemented |
| `post` | `/api/billing/activate` | ✅ implemented |
| `post` | `/api/billing/bank-transfer` | pending |
| `post` | `/api/billing/confirm-payment` | pending |
| `post` | `/api/billing/create-checkout-session` | ✅ implemented |
| `post` | `/api/billing/payment-intent` | ✅ implemented |
| `post` | `/api/billing/start-trial` | ✅ implemented |
| `post` | `/api/billing/webhook` | ✅ implemented |
| `post` | `/api/ecph/entries` | pending |
| `post` | `/api/esri-dashboards` | pending |
| `post` | `/api/esri-dashboards/sources/probe` | pending |
| `post` | `/api/gateway/claude/messages` | ✅ implemented |
| `post` | `/api/gateway/deepseek/chat` | ✅ implemented |
| `post` | `/api/gateway/gemini/generate-content` | ✅ implemented |
| `post` | `/api/gateway/openai/chat` | ✅ implemented |
| `post` | `/api/geo/:geoId/forms` | pending |
| `post` | `/api/geo/grounding/invoke` | ✅ implemented |
| `post` | `/api/geo/locations` | ✅ implemented |
| `post` | `/api/gis/db/test` | pending |
| `post` | `/api/gis/external-tables/:table/rows` | pending |
| `post` | `/api/gis/relationships` | pending |
| `post` | `/api/gis/resolve` | pending |
| `post` | `/api/github/disconnect` | ✅ implemented |
| `post` | `/api/github/repos/:owner/:repo/issues` | ✅ implemented |
| `post` | `/api/github/webhook` | pending |
| `post` | `/api/log/client` | pending |
| `post` | `/api/rbac/invites/accept` | ✅ implemented |
| `post` | `/api/rbac/invites` | ✅ implemented |
| `post` | `/api/rbac/users/:id/approve` | ✅ implemented |
| `post` | `/api/rbac/users/:id/reactivate` | ✅ implemented |
| `post` | `/api/rbac/users/:id/suspend` | ✅ implemented |
| `post` | `/api/system/tokens/migrate-from-vault` | pending |
| `post` | `/api/system/tokens/:name/test` | pending |
| `post` | `/api/tree-detection` | pending |
| `post` | `/api/v1/admin/directory/backup` | pending |
| `post` | `/api/v1/admin/directory/login-event` | pending |
| `post` | `/api/v1/admin/directory/restore` | pending |
| `put` | `/api/gis/external-tables/:table/rows/:rowId` | pending |
| `put` | `/api/gis/relationships/:id` | pending |
| `put` | `/api/system/api-secrets` | pending |
| `put` | `/api/system/api-vault` | pending |
| `put` | `/api/system/tokens/:name` | pending |
| `put` | `/api/user/api-tokens/:provider` | pending |
| `put` | `/api/v1/account/profile-extra` | ✅ implemented |
| `put` | `/api/v1/admin/directory` | pending |
| `use` | `/api/analysis-engine` | pending |
| `use` | `/api/auth` | pending |
| `use` | `/api` | pending |
| `use` | `/api/v1` | pending |
