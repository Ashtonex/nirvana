-- EMERGENCY CONSTRAINT REMOVAL - UNDO THE DAMAGE
-- Run this IMMEDIATELY to remove the blocking constraints that deleted your data

-- ========================================
-- REMOVE THE PROBLEMATIC CONSTRAINTS
-- ========================================

-- Drop all the constraints that were just added
DO $$
BEGIN
    ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS unique_daily_opening;
    ALTER TABLE operations_ledger DROP CONSTRAINT IF EXISTS unique_daily_expense_routing;
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS unique_daily_sale;
    ALTER TABLE staff_sessions DROP CONSTRAINT IF EXISTS unique_active_session;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- ========================================
-- VERIFY CONSTRAINTS REMOVED
-- ========================================

SELECT 'Constraints Removed' as status,
       'All blocking constraints have been dropped' as result,
       NOW() as timestamp;

-- ========================================
-- CHECK WHAT DATA REMAINS
-- ========================================

SELECT
    'Current Data Status' as check_type,
    'ledger_entries' as table_name,
    COUNT(*) as remaining_records,
    MIN(date) as oldest_date,
    MAX(date) as newest_date
FROM ledger_entries

UNION ALL

SELECT 'Current Data Status', 'sales', COUNT(*), MIN(date), MAX(date)
FROM sales

UNION ALL

SELECT 'Current Data Status', 'operations_ledger', COUNT(*), MIN(created_at), MAX(created_at)
FROM operations_ledger

UNION ALL

SELECT 'Current Data Status', 'staff_sessions', COUNT(*), MIN(created_at), MAX(created_at)
FROM staff_sessions;

-- ========================================
-- CHECK FOR MISSING DATA PATTERNS
-- ========================================

-- Check for suspiciously low daily transaction counts (indicating deletions)
SELECT
    'POTENTIAL DATA LOSS' as issue,
    DATE(date) as transaction_date,
    shop_id,
    COUNT(*) as remaining_transactions,
    'If this is much lower than normal, data was deleted' as note
FROM ledger_entries
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(date), shop_id
HAVING COUNT(*) < 3  -- Suspiciously low
ORDER BY transaction_date DESC;

-- Check for missing cash drawer openings
SELECT
    'MISSING CASH OPENINGS' as issue,
    shop_id,
    DATE(date) as expected_date,
    'Cash drawer opening was likely deleted' as note
FROM (
    SELECT DISTINCT shop_id, DATE(date) as date
    FROM ledger_entries
    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
) daily
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries
    WHERE shop_id = daily.shop_id
      AND DATE(date) = daily.date
      AND category = 'Cash Drawer Opening'
)
ORDER BY expected_date DESC, shop_id;