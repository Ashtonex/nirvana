-- VERIFY DATA RECOVERY STATUS
-- Check what data exists and what might still be missing

-- ========================================
-- CURRENT DATA STATUS
-- ========================================

-- Count current records by type
SELECT 'Current Ledger Entries' as table_name, COUNT(*) as count, 'All records' as note
FROM ledger_entries

UNION ALL

SELECT 'Current Sales' as table_name, COUNT(*) as count, 'All records' as note
FROM sales

UNION ALL

SELECT 'Current Operations Ledger' as table_name, COUNT(*) as count, 'All records' as note
FROM operations_ledger;

-- ========================================
-- RECENT ACTIVITY CHECK
-- ========================================

-- Check recent activity (last 24 hours)
SELECT 'Recent Ledger Entries' as item, COUNT(*) as count, 'Last 24 hours' as period
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Recent Sales' as item, COUNT(*) as count, 'Last 24 hours' as period
FROM sales
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Recent Operations Ledger' as item, COUNT(*) as count, 'Last 24 hours' as period
FROM operations_ledger
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- ========================================
-- CASH DRAWER OPENINGS CHECK
-- ========================================

-- Check today's cash drawer openings
SELECT 
    shop_id,
    COUNT(*) as openings_today,
    STRING_AGG(description, ' | ') as descriptions
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
  AND DATE(date) = DATE(NOW())
GROUP BY shop_id
ORDER BY shop_id;

-- ========================================
-- RECOVERY ENTRIES CHECK
-- ========================================

-- Check if recovery entries exist
SELECT 'Recovery Entries Found' as status, COUNT(*) as count
FROM ledger_entries
WHERE description LIKE '%Recovery%'
  AND DATE(date) = DATE(NOW())

UNION ALL

SELECT 'Recovery Sales Found' as status, COUNT(*) as count
FROM sales
WHERE item_name = 'Recovered Sale'
  AND DATE(date) = DATE(NOW())

UNION ALL

SELECT 'Recovery Operations Found' as status, COUNT(*) as count
FROM operations_ledger
WHERE notes LIKE '%Recovery%'
  AND DATE(created_at) = DATE(NOW());

-- ========================================
-- CASH BALANCE VERIFICATION
-- ========================================

-- Calculate current cash positions
SELECT 
    shop_id,
    SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) as openings,
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
    (SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) + 
     SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
     SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)) as net_cash
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '24 hours'
GROUP BY shop_id
ORDER BY shop_id;

-- ========================================
-- POTENTIAL DATA GAPS
-- ========================================

-- Look for gaps in daily activity
SELECT 
    DATE(date) as transaction_date,
    COUNT(*) as daily_transactions,
    CASE 
        WHEN COUNT(*) < 5 THEN 'LOW ACTIVITY - POSSIBLE DATA LOSS'
        ELSE 'NORMAL ACTIVITY'
    END as status
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '7 days'
GROUP BY DATE(date)
ORDER BY transaction_date DESC;

SELECT 'VERIFICATION COMPLETE' as status,
       'Review the results above to assess data recovery' as action,
       'Check if critical transactions are present' as note;
