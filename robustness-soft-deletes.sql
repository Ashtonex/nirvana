-- ROBUSTNESS UPGRADE: SOFT DELETES
-- This script adds the deleted_at safety net to your core tables

-- 1. Add deleted_at column to main tables
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE operations_ledger ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create indices for performance
CREATE INDEX IF NOT EXISTS idx_ledger_deleted_at ON ledger_entries(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at ON sales(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ops_ledger_deleted_at ON operations_ledger(deleted_at) WHERE deleted_at IS NULL;

-- 3. Comment for documentation
COMMENT ON COLUMN ledger_entries.deleted_at IS 'Safety net: When not null, record is hidden but not wiped.';
COMMENT ON COLUMN sales.deleted_at IS 'Safety net: When not null, record is hidden but not wiped.';
COMMENT ON COLUMN operations_ledger.deleted_at IS 'Safety net: When not null, record is hidden but not wiped.';
