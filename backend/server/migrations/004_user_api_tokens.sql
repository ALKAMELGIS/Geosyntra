-- Per-user API tokens (encrypted at rest). Survives logout, refresh, and re-login.

CREATE TABLE IF NOT EXISTS user_api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  value_envelope TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user ON user_api_tokens (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_email ON user_api_tokens (user_email);
