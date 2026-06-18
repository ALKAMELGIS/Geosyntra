-- Task 33.4: temporary permission grants for elevated access windows.
CREATE TABLE IF NOT EXISTS temporary_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  description TEXT NOT NULL DEFAULT '',
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_temporary_grants_active
  ON temporary_grants (tenant_id, user_id)
  WHERE revoked_at IS NULL;
