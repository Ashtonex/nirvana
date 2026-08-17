-- schema.sql has always declared invest_deposits.withdraw_shop_id, and application code
-- (both the original app/api/invest/deposits/withdraw/route.ts and lib/cash-pools.ts's
-- recordInvestWithdrawal) has always written to it — but it was never actually applied to the
-- live database. Every invest withdrawal through those paths has been failing with
-- "column invest_deposits.withdraw_shop_id does not exist" as a result. This adds the column
-- to match what schema.sql and the application have always assumed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invest_deposits' AND column_name = 'withdraw_shop_id'
  ) THEN
    ALTER TABLE invest_deposits ADD COLUMN withdraw_shop_id TEXT;
  END IF;
END $$;
