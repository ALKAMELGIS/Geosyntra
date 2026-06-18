-- Versioned authorization policy storage (SQLite). One active version per tenant.

CREATE TABLE IF NOT EXISTS authorization_policy_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  UNIQUE (tenant_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_authorization_policy_versions_active
  ON authorization_policy_versions (tenant_id)
  WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS authorization_policies (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  action TEXT NOT NULL,
  effect TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  required_relations TEXT NOT NULL DEFAULT '[]',
  required_subject_attributes TEXT NOT NULL DEFAULT '{}',
  required_resource_attributes TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (version_id) REFERENCES authorization_policy_versions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_authorization_policies_version
  ON authorization_policies (version_id);
