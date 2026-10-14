-- Enforce explicit pool metadata for operations that cross cash-pool boundaries.
-- NOT VALID avoids failing rollout because of older legacy rows, while still
-- enforcing the rule for new inserts and updates.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operations_ledger_sensitive_cash_pool_metadata'
  ) THEN
    ALTER TABLE operations_ledger
      ADD CONSTRAINT operations_ledger_sensitive_cash_pool_metadata
      CHECK (
        kind NOT IN ('stock_orders', 'invest_deposit', 'invest_withdrawal')
        OR (
          metadata ->> 'cashPoolTransaction' = 'true'
          AND metadata ->> 'fundingPool' IN ('savings', 'overhead', 'invest')
        )
      )
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'operations_ledger_invest_kind_uses_invest_pool'
  ) THEN
    ALTER TABLE operations_ledger
      ADD CONSTRAINT operations_ledger_invest_kind_uses_invest_pool
      CHECK (
        kind NOT IN ('invest_deposit', 'invest_withdrawal')
        OR metadata ->> 'fundingPool' = 'invest'
      )
      NOT VALID;
  END IF;
END $$;
