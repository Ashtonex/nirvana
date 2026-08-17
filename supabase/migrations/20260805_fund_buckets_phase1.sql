-- Phase 1 of the fund-bucket enforcement rollout (additive only, zero behavior change).
-- Introduces bucket_key on operations_ledger (nullable for now — enforced NOT NULL in a
-- later cutover migration once historical data is backfilled and all write paths migrated),
-- an atomic actual_balance increment function (replaces app-level read-then-upsert races),
-- a live bucket-balance view (never cached, so nothing can drift), structural invest-linkage
-- columns on invest_deposits, and a stock-solvency trigger function that is NOT yet attached
-- to the table (attached only after a warn-only soak period, per the approved plan).

-- 1a. bucket_key column + CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations_ledger' AND column_name = 'bucket_key'
  ) THEN
    ALTER TABLE operations_ledger ADD COLUMN bucket_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operations_ledger_bucket_key_valid'
  ) THEN
    ALTER TABLE operations_ledger
      ADD CONSTRAINT operations_ledger_bucket_key_valid
      CHECK (
        bucket_key IS NULL OR bucket_key IN
          ('rent', 'salaries', 'savings_blackbox', 'stock', 'invest_perfumes', 'general')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_operations_ledger_bucket_shop_date
  ON operations_ledger (bucket_key, shop_id, effective_date);

-- 1b. Atomic actual_balance increment — replaces 4 separate app-level read-then-upsert sites
CREATE OR REPLACE FUNCTION increment_operations_actual_balance(delta NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE operations_state
    SET actual_balance = actual_balance + delta, updated_at = now()
    WHERE id = 1
    RETURNING actual_balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- 1c. Live bucket-balance view — a SUM, never a cached field, so it cannot drift by construction.
-- shop_id is coalesced to '__company__' so company-wide (shop_id IS NULL) rows get their own group;
-- every real shop_id value (including 'tshirts', which is not one of the 3 physical shops but is
-- tracked as its own location) naturally gets its own row with no special-casing required.
CREATE OR REPLACE VIEW operations_bucket_balances AS
SELECT
  COALESCE(shop_id, '__company__') AS shop_key,
  bucket_key,
  SUM(amount) AS balance
FROM operations_ledger
WHERE bucket_key IS NOT NULL AND deleted_at IS NULL
GROUP BY COALESCE(shop_id, '__company__'), bucket_key;

-- 1d. Structural invest-linkage columns (soft references, not FK-enforced — ledger_entries and
-- shops are not version-controlled tables, and an FK here could turn a legitimate future
-- correction into a blocked write; indexed instead for lookup performance).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invest_deposits' AND column_name = 'source_ledger_entry_id'
  ) THEN
    ALTER TABLE invest_deposits ADD COLUMN source_ledger_entry_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invest_deposits' AND column_name = 'source_operations_ledger_id'
  ) THEN
    ALTER TABLE invest_deposits ADD COLUMN source_operations_ledger_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invest_deposits' AND column_name = 'bucket_key'
  ) THEN
    ALTER TABLE invest_deposits ADD COLUMN bucket_key TEXT DEFAULT 'invest_perfumes';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invest_deposits_source_ledger_entry
  ON invest_deposits (source_ledger_entry_id);

-- 1e. Stock-bucket solvency check, written now but deliberately NOT attached as a trigger yet.
-- Attached in the Phase 7 cutover migration after a warn-only soak period confirms the check
-- doesn't false-positive against real usage. Uses an advisory lock scoped to (shop, bucket) so
-- concurrent stock withdrawals from the same shop serialize correctly instead of racing past
-- each other's balance read.
CREATE OR REPLACE FUNCTION enforce_stock_bucket_solvency() RETURNS TRIGGER AS $$
DECLARE
  current_balance NUMERIC;
BEGIN
  IF NEW.bucket_key = 'stock' AND NEW.amount < 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(COALESCE(NEW.shop_id, '__company__') || ':stock'));
    SELECT COALESCE(SUM(amount), 0) INTO current_balance
      FROM operations_ledger
      WHERE bucket_key = 'stock'
        AND shop_id IS NOT DISTINCT FROM NEW.shop_id
        AND deleted_at IS NULL;
    IF current_balance + NEW.amount < 0 AND COALESCE(NEW.metadata ->> 'stockOverride', 'false') <> 'true' THEN
      RAISE EXCEPTION 'stock_bucket_insufficient_funds: shop=% balance=% attempted_change=%',
        COALESCE(NEW.shop_id, 'company'), current_balance, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
