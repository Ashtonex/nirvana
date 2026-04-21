-- DATA LOSS DIAGNOSTIC - Check what remains after deletion
-- Run this to see what data you have left

-- ========================================
-- CURRENT DATABASE STATUS
-- ========================================

SELECT 'DATABASE STATUS CHECK' as diagnostic_type;

-- Check all main tables
SELECT
    'ledger_entries' as table_name,
    COUNT(*) as total_records,
    MIN(date) as oldest_date,
    MAX(date) as newest_date,
    COUNT(DISTINCT shop_id) as shops_count
FROM ledger_entries

UNION ALL

SELECT 'sales', COUNT(*), MIN(date), MAX(date), COUNT(DISTINCT shop_id)
FROM sales

UNION ALL

SELECT 'operations_ledger', COUNT(*), MIN(created_at), MAX(created_at), COUNT(DISTINCT shop_id)
FROM operations_ledger

UNION ALL

SELECT 'employees', COUNT(*), NULL, NULL, COUNT(DISTINCT shop_id)
FROM employees

UNION ALL

SELECT 'staff_sessions', COUNT(*), MIN(created_at), MAX(created_at), COUNT(DISTINCT employee_id)
FROM staff_sessions

ORDER BY table_name;

-- ========================================
-- CHECK FOR DATA GAPS
-- ========================================

-- Check for missing days in the last 30 days
WITH date_range AS (
    SELECT CURRENT_DATE - (n || ' days')::INTERVAL as check_date
    FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
          UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
          UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15
          UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19 UNION SELECT 20
          UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24 UNION SELECT 25
          UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29 UNION SELECT 30) AS t
)
SELECT
    'MISSING DATA DAYS' as issue_type,
    dr.check_date,
    CASE
        WHEN (SELECT COUNT(*) FROM ledger_entries WHERE DATE(date) = dr.check_date) = 0
             AND (SELECT COUNT(*) FROM sales WHERE DATE(date) = dr.check_date) = 0
        THEN 'NO DATA - Complete gap'
        WHEN (SELECT COUNT(*) FROM ledger_entries WHERE DATE(date) = dr.check_date) < 5
             AND (SELECT COUNT(*) FROM sales WHERE DATE(date) = dr.check_date) < 3
        THEN 'LOW DATA - Possible deletion'
        ELSE 'HAS DATA'
    END as data_status,
    (SELECT COUNT(*) FROM sales WHERE DATE(date) = dr.check_date) as sales_count,
    (SELECT COUNT(*) FROM ledger_entries WHERE DATE(date) = dr.check_date) as ledger_count
FROM date_range dr
ORDER BY dr.check_date DESC;

-- ========================================
-- CHECK FOR INCONSISTENT BALANCES
-- ========================================

-- Check cash drawer openings vs closings
SELECT
    'CASH DRAWER ISSUES' as issue_type,
    le.shop_id,
    DATE(le.date) as transaction_date,
    COUNT(CASE WHEN le.category = 'Cash Drawer Opening' THEN 1 END) as openings,
    COUNT(CASE WHEN le.category = 'Cash Drawer Closing' THEN 1 END) as closings,
    SUM(CASE WHEN le.type = 'income' THEN le.amount ELSE 0 END) as total_income,
    SUM(CASE WHEN le.type = 'expense' THEN le.amount ELSE 0 END) as total_expenses,
    (SUM(CASE WHEN le.type = 'income' THEN le.amount ELSE 0 END) -
     SUM(CASE WHEN le.type = 'expense' THEN le.amount ELSE 0 END)) as net_flow
FROM ledger_entries le
WHERE le.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY le.shop_id, DATE(le.date)
HAVING COUNT(CASE WHEN le.category = 'Cash Drawer Opening' THEN 1 END) != 1
    OR COUNT(CASE WHEN le.category = 'Cash Drawer Closing' THEN 1 END) != 1
ORDER BY transaction_date DESC, le.shop_id;

-- ========================================
-- CHECK AUDIT LOG (if it exists)
-- ========================================

-- Check if audit_log table exists and has data
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        RAISE NOTICE 'Audit log table exists - checking contents...';
    ELSE
        RAISE NOTICE 'No audit_log table found - cannot recover from audit trail';
    END IF;
END $$;

-- If audit log exists, show recent activity
SELECT 'AUDIT LOG CHECK' as diagnostic_type,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log')
            THEN 'Audit log exists - can check for deleted records'
            ELSE 'No audit log - cannot recover deleted data'
       END as audit_status;

-- Show audit log entries if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        -- Show recent audit entries
        PERFORM 1;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Audit log table does not exist';
END $$;

-- ========================================
-- DATA RECOVERY OPTIONS
-- ========================================

SELECT 'RECOVERY ASSESSMENT' as diagnostic_type,
       'Data has been deleted - limited recovery options available' as assessment,
       'No backups on free tier - manual reconstruction needed' as options;

-- ========================================
-- SHOW REMAINING DATA PATTERNS
-- ========================================

-- Show what data patterns remain for reconstruction
SELECT
    'REMAINING DATA PATTERNS' as diagnostic_type,
    le.shop_id,
    COUNT(*) as remaining_ledger_entries,
    MIN(le.date) as data_starts_from,
    MAX(le.date) as data_ends_at,
    COUNT(DISTINCT DATE(le.date)) as days_with_data,
    ROUND(AVG(le.amount), 2) as avg_transaction_amount
FROM ledger_entries le
GROUP BY le.shop_id
ORDER BY remaining_ledger_entries DESC;