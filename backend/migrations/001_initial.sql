CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  city TEXT NOT NULL DEFAULT '',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  roles TEXT[] NOT NULL DEFAULT ARRAY['user'],
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_provider_external_idx ON users (auth_provider, external_id) WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone) WHERE phone <> '';

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  customer_account_id TEXT NOT NULL DEFAULT '',
  worker_account_id TEXT NOT NULL DEFAULT '',
  task JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_status_updated_idx ON tasks (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_customer_idx ON tasks (customer_account_id) WHERE customer_account_id <> '';
CREATE INDEX IF NOT EXISTS tasks_worker_idx ON tasks (worker_account_id) WHERE worker_account_id <> '';

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  task_public_id TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  payment JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_status_updated_idx ON payments (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS payments_account_idx ON payments (account_id) WHERE account_id <> '';

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  bank TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  payout JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payouts_status_updated_idx ON payouts (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS payouts_account_idx ON payouts (account_id) WHERE account_id <> '';

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  task_public_id TEXT NOT NULL DEFAULT '',
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id TEXT NOT NULL DEFAULT '',
  transaction JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_account_created_idx ON transactions (account_id, created_at DESC) WHERE account_id <> '';
CREATE INDEX IF NOT EXISTS transactions_reference_idx ON transactions (account_id, reference_type, reference_id) WHERE reference_type <> '' AND reference_id <> '';

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'bot',
  reason TEXT NOT NULL DEFAULT '',
  task_public_id TEXT NOT NULL DEFAULT '',
  created_by_account_id TEXT NOT NULL DEFAULT '',
  ticket JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx ON support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_created_by_idx ON support_tickets (created_by_account_id, updated_at DESC) WHERE created_by_account_id <> '';
CREATE INDEX IF NOT EXISTS support_tickets_task_idx ON support_tickets (task_public_id) WHERE task_public_id <> '';

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  actor_account_id TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  entry JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id) WHERE target_id <> '';

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  file JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS files_account_idx ON files (account_id) WHERE account_id <> '';

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_account_idx ON push_subscriptions (account_id) WHERE account_id <> '';

CREATE TABLE IF NOT EXISTS sms_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  status TEXT NOT NULL,
  code_hash TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sms_codes_phone_expires_idx ON sms_codes (phone, expires_at DESC);
