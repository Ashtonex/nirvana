-- Operations and Invest Schema for Nirvana POS
-- Run this in your Supabase SQL Editor

-- Drift Resolutions Table
CREATE TABLE IF NOT EXISTS operations_drifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  resolved_kind TEXT,
  resolved_shop TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE operations_drifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on operations_drifts" ON operations_drifts FOR ALL USING (true) WITH CHECK (true);

-- Operations Ledger Table
CREATE TABLE IF NOT EXISTS operations_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'adjustment',
  shop_id TEXT,
  overhead_category TEXT,
  title TEXT,
  notes TEXT,
  employee_id TEXT,
  metadata JSONB DEFAULT '{}',
  effective_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE operations_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on operations_ledger" ON operations_ledger FOR ALL USING (true) WITH CHECK (true);

-- Operations State Table
CREATE TABLE IF NOT EXISTS operations_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  actual_balance NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE operations_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on operations_state" ON operations_state FOR ALL USING (true) WITH CHECK (true);

-- Cash Handshakes Table (for tracking cash transfers between shops)
CREATE TABLE IF NOT EXISTS operations_handshakes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_shop TEXT NOT NULL,
  to_shop TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  associate TEXT,
  initiated_by TEXT,
  acknowledged_by TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

ALTER TABLE operations_handshakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on operations_handshakes" ON operations_handshakes FOR ALL USING (true) WITH CHECK (true);

-- Invest Peer Cycles Table
CREATE TABLE IF NOT EXISTS invest_peer_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Peer Pool',
  peers_count INTEGER DEFAULT 5,
  contribution_amount NUMERIC(12,2) DEFAULT 0,
  your_position INTEGER DEFAULT 1,
  frequency_days INTEGER DEFAULT 7,
  start_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invest_peer_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on invest_peer_cycles" ON invest_peer_cycles FOR ALL USING (true) WITH CHECK (true);

-- Invest Peer Events Table
CREATE TABLE IF NOT EXISTS invest_peer_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID REFERENCES invest_peer_cycles(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  event_date DATE,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invest_peer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on invest_peer_events" ON invest_peer_events FOR ALL USING (true) WITH CHECK (true);

-- Invest Deposits Table (for tracking POS perfume deposits)
CREATE TABLE IF NOT EXISTS invest_deposits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposited_by TEXT,
  deposited_at TIMESTAMPTZ DEFAULT now(),
  withdrawn_amount NUMERIC(12,2) DEFAULT 0,
  withdrawn_at TIMESTAMPTZ,
  withdrawn_by TEXT,
  withdraw_title TEXT,
  withdraw_shop_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'partial'))
);

ALTER TABLE invest_deposits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on invest_deposits" ON invest_deposits FOR ALL USING (true) WITH CHECK (true);

-- Initialize operations_state if not exists
INSERT INTO operations_state (id, actual_balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
