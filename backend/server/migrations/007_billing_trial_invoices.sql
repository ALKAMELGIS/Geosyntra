-- Trial window + billing history (re-applied after migration 003 was renumbered).
ALTER TABLE user_subscriptions ADD COLUMN trial_started_at TEXT;
ALTER TABLE user_subscriptions ADD COLUMN trial_ends_at TEXT;
ALTER TABLE user_subscriptions ADD COLUMN billing_plan_id TEXT;

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices (user_id, created_at DESC);
