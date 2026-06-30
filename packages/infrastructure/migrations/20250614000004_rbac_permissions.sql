-- RBAC permission slugs + role matrix seed tables (Task 10).
CREATE TABLE IF NOT EXISTS rbac_permissions (
  slug TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rbac_roles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_tenant ON rbac_roles (tenant_id);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id TEXT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_slug TEXT NOT NULL REFERENCES rbac_permissions(slug) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_slug)
);
