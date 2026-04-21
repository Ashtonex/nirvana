-- CRITICAL DATA RECOVERY - LAST RESORT
-- ONLY RUN IF SUPABASE BACKUP RESTORE FAILS

-- ========================================
-- CHECK WHAT WAS LOST
-- ========================================

-- Check current record counts
SELECT 'Current State' as table_name, COUNT(*) as current_count
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Sales', COUNT(*)
FROM sales
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Operations Ledger', COUNT(*)
FROM operations_ledger
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- ========================================
-- LOOK FOR DELETED DATA PATTERNS
-- ========================================

-- Check for gaps in transaction sequences
SELECT 'Transaction Gaps' as issue, 
       COUNT(*) as gap_count,
       'Missing records detected' as status
FROM (
    SELECT DATE(date) as transaction_date, COUNT(*) as daily_count
    FROM ledger_entries
    WHERE date >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(date)
    ORDER BY transaction_date DESC
) daily_counts
WHERE daily_count < 10; -- Suspiciously low daily counts

-- ========================================
-- RECONSTRUCT FROM AVAILABLE DATA
-- ========================================

-- Reconstruct cash drawer openings from patterns
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    shop_id,
    'asset' as type,
    'Cash Drawer Opening' as category,
    COALESCE(daily_avg, 500.00) as amount,
    DATE(NOW()) || ' 09:00:00' as timestamp,
    'Emergency Recovery - Reconstructed Opening' as description,
    'SYSTEM' as employee_id
FROM (
    SELECT 
        shop_id,
        AVG(amount) as daily_avg
    FROM ledger_entries
    WHERE category = 'Cash Drawer Opening'
      AND date >= NOW() - INTERVAL '7 days'
      AND date < NOW() - INTERVAL '1 day'
    GROUP BY shop_id
) shop_averages
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries 
    WHERE shop_id = shop_averages.shop_id 
      AND category = 'Cash Drawer Opening' 
      AND DATE(date) = DATE(NOW())
);

-- ========================================
-- VERIFY RECOVERY
-- ========================================

SELECT 'Recovery Verification' as status,
       COUNT(*) as openings_today,
       'Cash drawer openings reconstructed' as note
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
  AND DATE(date) = DATE(NOW());
