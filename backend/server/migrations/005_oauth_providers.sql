-- OAuth provider columns + refresh token store (admin_users may not exist until first directory sync)
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  scope TEXT,
  managed_by_id INTEGER,
  last_login TEXT,
  password_hash TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT,
  oauth_google_sub TEXT,
  oauth_apple_sub TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

ALTER TABLE admin_users ADD COLUMN username TEXT;
ALTER TABLE admin_users ADD COLUMN profile_image TEXT;
ALTER TABLE admin_users ADD COLUMN oauth_github_sub TEXT;
ALTER TABLE admin_users ADD COLUMN oauth_linkedin_sub TEXT;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens(user_id);
