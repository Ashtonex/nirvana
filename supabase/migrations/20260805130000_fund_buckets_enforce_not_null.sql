-- Phase 7 (partial) of the fund-bucket rollout: makes bucket_key mandatory on operations_ledger.
-- All 6 real write paths (postFundTransaction and its callers) now always set bucket_key, and the
-- Jan-2026-onward historical backfill left 0 NULL rows (verified — this is also the entire history,
-- no pre-2026 data exists). Safe to enforce.
--
-- The stock-solvency trigger (enforce_stock_bucket_solvency, written in the Phase 1 migration) is
-- deliberately NOT attached here — the Stock bucket only has real balances from today's backfill,
-- so it needs a soak period in warn-only mode (already live in postFundTransaction) before a hard
-- block is safe to turn on for real shop usage.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations_ledger' AND column_name = 'bucket_key' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE operations_ledger ALTER COLUMN bucket_key SET NOT NULL;
  END IF;
END $$;
