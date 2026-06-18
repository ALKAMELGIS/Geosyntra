-- Central API token registry (encrypted at rest). Owner-managed; consumed server-side only.

CREATE TABLE IF NOT EXISTS system_tokens (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'integration',
  value_envelope TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  last_tested_at TEXT,
  last_test_ok INTEGER,
  last_test_message TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_tokens_active ON system_tokens (active);

CREATE TABLE IF NOT EXISTS system_token_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_name TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_token_audit_name ON system_token_audit (token_name, created_at DESC);
