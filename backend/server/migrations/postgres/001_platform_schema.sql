-- PostgreSQL platform schema (equivalent to SQLite migrations 001–007 + admin directory tables).

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_kv_updated ON platform_kv(updated_at);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  scope TEXT,
  managed_by_id BIGINT,
  last_login TEXT,
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  verification_token_expires TEXT,
  oauth_google_sub TEXT,
  oauth_apple_sub TEXT,
  oauth_github_sub TEXT,
  oauth_linkedin_sub TEXT,
  username TEXT,
  profile_image TEXT,
  profile_extra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status);

CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit(at);

CREATE TABLE IF NOT EXISTS admin_login_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES admin_users(id),
  email TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_admin_login_at ON admin_login_history(at);

CREATE TABLE IF NOT EXISTS admin_directory_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id BIGINT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  billing_provider TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TEXT,
  limits_json TEXT,
  trial_started_at TEXT,
  trial_ends_at TEXT,
  billing_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id BIGINT NOT NULL,
  usage_date TEXT NOT NULL,
  ai_queries INTEGER NOT NULL DEFAULT 0,
  grounding_calls INTEGER NOT NULL DEFAULT 0,
  exports INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_user ON usage_daily (user_id);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  plan TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  description TEXT,
  external_id TEXT,
  paid_at TEXT,
  period_start TEXT,
  period_end TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_api_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  value_envelope TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user ON user_api_tokens (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_email ON user_api_tokens (user_email);

CREATE TABLE IF NOT EXISTS system_tokens (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'integration',
  value_envelope TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TEXT,
  last_tested_at TEXT,
  last_test_ok BOOLEAN,
  last_test_message TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_tokens_active ON system_tokens (active);

CREATE TABLE IF NOT EXISTS system_token_audit (
  id BIGSERIAL PRIMARY KEY,
  token_name TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_email TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_token_audit_name ON system_token_audit (token_name, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS role_invites (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  invited_by BIGINT,
  invited_by_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_invites_email ON role_invites(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_role_invites_token ON role_invites(token);
