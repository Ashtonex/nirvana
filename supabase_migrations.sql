-- ============================================================
-- NIRVANA POS - SUPABASE SQL MIGRATIONS
-- Paste this entire file into Supabase SQL editor and run it.
-- Safe to re-run (uses CREATE OR REPLACE and IF NOT EXISTS).
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
--    NOTE: group_name now includes 'Stock Orders'
CREATE TABLE IF NOT EXISTS expense_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('operations_ledger', 'ledger_entries')),
  group_name text NOT NULL CHECK (group_name IN ('Overheads', 'Stock Orders', 'Transfers', 'Personal Use', 'Other')),
  classified_by text DEFAULT 'owner',
  classified_at timestamptz DEFAULT now(),
  UNIQUE(expense_id, source)
);

-- If the table already exists from a previous migration, update the constraint to include Stock Orders:
DO $$
BEGIN
  -- Drop old constraint if it exists
  ALTER TABLE expense_classifications DROP CONSTRAINT IF EXISTS expense_classifications_group_name_check;
  -- Add updated constraint
  ALTER TABLE expense_classifications
    ADD CONSTRAINT expense_classifications_group_name_check
    CHECK (group_name IN ('Overheads', 'Stock Orders', 'Transfers', 'Personal Use', 'Other'));
EXCEPTION WHEN others THEN
  NULL; -- Ignore if table didn't exist yet (handled by CREATE TABLE above)
END;
$$;

-- Enable RLS
ALTER TABLE expense_classifications ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses service role key)
DROP POLICY IF EXISTS "Service role full access" ON expense_classifications;
CREATE POLICY "Service role full access" ON expense_classifications
  FOR ALL USING (true) WITH CHECK (true);
