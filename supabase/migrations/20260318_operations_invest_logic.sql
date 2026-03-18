-- Operations / Invest / Logic foundation tables

-- 1) Operations master vault state (editable "actual cash")
CREATE TABLE IF NOT EXISTS operations_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  actual_balance NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO operations_state (id, actual_balance)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- 2) Operations ledger (every movement into/out of the master vault)
CREATE TABLE IF NOT EXISTS operations_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::date,
  amount NUMERIC NOT NULL,
  kind TEXT NOT NULL,
  shop_id TEXT NULL,
  overhead_category TEXT NULL,
  title TEXT NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  employee_id UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_operations_ledger_effective_date ON operations_ledger (effective_date);
CREATE INDEX IF NOT EXISTS idx_operations_ledger_kind ON operations_ledger (kind);
CREATE INDEX IF NOT EXISTS idx_operations_ledger_shop_id ON operations_ledger (shop_id);
CREATE INDEX IF NOT EXISTS idx_operations_ledger_overhead_category ON operations_ledger (overhead_category);

-- 3) Loans (capital injections that must be repaid)
CREATE TABLE IF NOT EXISTS operations_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_name TEXT NOT NULL,
  provider_email TEXT NULL,
  provider_phone TEXT NULL,
  principal NUMERIC NOT NULL DEFAULT 0,
  rate_percent NUMERIC NOT NULL DEFAULT 0,
  start_date DATE NULL,
  due_date DATE NULL,
  payment_structure TEXT NULL,
  agreement_url TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_operations_loans_active ON operations_loans (active);

-- 4) Peer system cycles (Invest page)
CREATE TABLE IF NOT EXISTS peer_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT NOT NULL,
  peers_count INTEGER NOT NULL DEFAULT 0,
  contribution_amount NUMERIC NOT NULL DEFAULT 0,
  your_position INTEGER NULL,
  frequency_days INTEGER NOT NULL DEFAULT 7,
  start_date DATE NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_peer_cycles_active ON peer_cycles (active);

-- 5) Peer cycle events (contributions/payouts)
CREATE TABLE IF NOT EXISTS peer_cycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cycle_id UUID NOT NULL REFERENCES peer_cycles(id) ON DELETE CASCADE,
  event_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')::date,
  amount NUMERIC NOT NULL,
  direction TEXT NOT NULL, -- 'out' (we pay) or 'in' (we receive)
  title TEXT NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_peer_cycle_events_cycle_id ON peer_cycle_events (cycle_id);
CREATE INDEX IF NOT EXISTS idx_peer_cycle_events_event_date ON peer_cycle_events (event_date);

