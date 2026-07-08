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
