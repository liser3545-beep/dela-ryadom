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
