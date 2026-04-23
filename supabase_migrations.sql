-- ============================================================
-- NIRVANA POS - SUPABASE SQL MIGRATIONS
-- Paste this entire file into Supabase SQL editor and run it.
-- ============================================================

-- 1. RPC: Decrement shop-level inventory allocation safely (no negatives)
CREATE OR REPLACE FUNCTION decrement_allocation(item_id text, shop_id text, qty integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory_allocations
  SET quantity = GREATEST(0, quantity - qty)
  WHERE inventory_allocations.item_id = $1 AND inventory_allocations.shop_id = $2;
END;
$$;

-- 2. RPC: Decrement global inventory item quantity safely (no negatives)
CREATE OR REPLACE FUNCTION decrement_inventory(item_id text, qty integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory_items
  SET quantity = GREATEST(0, quantity - qty)
  WHERE id = $1;
END;
$$;

-- 3. Table: Persistent expense classifications (so the system learns your groupings)
CREATE TABLE IF NOT EXISTS expense_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('operations_ledger', 'ledger_entries')),
  group_name text NOT NULL CHECK (group_name IN ('Overheads', 'Transfers', 'Personal Use', 'Other')),
  classified_by text DEFAULT 'owner',
  classified_at timestamptz DEFAULT now(),
  UNIQUE(expense_id, source)
);

-- Enable RLS (Row Level Security) on expense_classifications
ALTER TABLE expense_classifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (your backend uses service role key)
CREATE POLICY "Service role full access" ON expense_classifications
  FOR ALL USING (true) WITH CHECK (true);
