-- RECOVERY DIAGNOSTIC - Run this in Supabase SQL Editor
-- This identifies exactly what was deleted and attempts safe recovery

-- ========================================
-- STEP 1: IDENTIFY MISSING DATA
-- ========================================

-- Check for gaps in cash drawer openings
SELECT 
    'MISSING OPENINGS' as issue_type,
    shop_id,
    DATE(date) as date,
    COUNT(*) as count_today
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
    AND date >= NOW() - INTERVAL '7 days'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) = 0 OR COUNT(*) < 1
ORDER BY date DESC;

-- Check for suspicious gaps in daily transaction counts
SELECT 
    'LOW TRANSACTION DAYS' as issue_type,
    DATE(le.date) as transaction_date,
    le.shop_id,
    COUNT(*) as transaction_count,
    LAG(COUNT(*)) OVER (PARTITION BY le.shop_id ORDER BY DATE(le.date)) as previous_day_count
FROM ledger_entries le
WHERE le.date >= NOW() - INTERVAL '7 days'
GROUP BY DATE(le.date), le.shop_id
HAVING COUNT(*) < 5  -- Suspiciously low (normal shops have 10+)
ORDER BY le.shop_id, transaction_date DESC;

-- Check for missing sales on dates that should have sales
SELECT 
    'LOW SALES DAYS' as issue_type,
    DATE(date) as sale_date,
    shop_id,
    COUNT(*) as sales_count,
    SUM(total_with_tax) as daily_total
FROM sales
WHERE date >= NOW() - INTERVAL '7 days'
GROUP BY DATE(date), shop_id
HAVING COUNT(*) < 2  -- Suspiciously low
ORDER BY sale_date DESC;

-- ========================================
-- STEP 2: CHECK WHAT DATES ARE MISSING DATA
-- ========================================

-- Generate calendar of all dates in last 7 days
WITH dates AS (
    SELECT CURRENT_DATE - (n || ' days')::INTERVAL as date
    FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6) AS t
)
-- Compare against actual dates with transactions
SELECT 
    'MISSING DATES' as issue,
    d.date,
    (SELECT COUNT(DISTINCT shop_id) FROM ledger_entries WHERE DATE(date) = d.date) as shops_with_data,
    (SELECT COUNT(DISTINCT shop_id) FROM employees WHERE is_active = true) as expected_shops
FROM dates d
WHERE (SELECT COUNT(DISTINCT shop_id) FROM ledger_entries WHERE DATE(date) = d.date) = 0
ORDER BY d.date DESC;

-- ========================================
-- STEP 3: ANALYZE DUPLICATE ENTRIES (Before Recovery)
-- ========================================

-- Show all duplicate cash drawer openings
SELECT 
    'CURRENT DUPLICATES' as status,
    shop_id,
    DATE(date) as opening_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as ids,
    STRING_AGG(TO_CHAR(amount, '9999.99'), ', ') as amounts,
    STRING_AGG(TO_CHAR(date, 'HH24:MI:SS'), ', ') as times
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
    AND date >= NOW() - INTERVAL '7 days'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) > 1
ORDER BY opening_date DESC, shop_id;

-- Show all duplicate sales (same client, same amount, same day)
SELECT 
    'DUPLICATE SALES' as status,
    shop_id,
    client_name,
    total_with_tax,
    DATE(date) as sale_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as ids
FROM sales
WHERE date >= NOW() - INTERVAL '7 days'
GROUP BY shop_id, client_name, total_with_tax, DATE(date)
HAVING COUNT(*) > 1
ORDER BY sale_date DESC;

-- ========================================
-- STEP 4: DETAILED TRANSACTION ANALYSIS
-- ========================================

-- Show all transactions for the last 3 days with timing
SELECT 
    DATE(date) as date,
    shop_id,
    category,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    MIN(date) as earliest_time,
    MAX(date) as latest_time,
    STRING_AGG(type || ':' || category, ' | ') as types_and_categories
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '3 days'
GROUP BY DATE(date), shop_id, category
ORDER BY date DESC, shop_id, category;

-- ========================================
-- STEP 5: RECOVERY READINESS CHECK
-- ========================================

-- Verify tables exist and have data
SELECT 
    'Table Status' as check_type,
    'ledger_entries' as table_name,
    COUNT(*) as row_count,
    MIN(date) as oldest_record,
    MAX(date) as newest_record
FROM ledger_entries

UNION ALL

SELECT 'Table Status', 'sales', COUNT(*), MIN(date), MAX(date)
FROM sales

UNION ALL

SELECT 'Table Status', 'operations_ledger', COUNT(*), MIN(created_at), MAX(created_at)
FROM operations_ledger

UNION ALL

SELECT 'Table Status', 'employees', COUNT(*), NULL, NULL
FROM employees

ORDER BY table_name;

-- ========================================
-- STEP 6: SUMMARY
-- ========================================

SELECT 
    'RECOVERY REPORT' as section,
    'Run this to get recovery insights' as note,
    NOW() as timestamp;

-- ========================================
-- DETAILED DATA QUALITY CHECK
-- ========================================

-- Check for duplicate cash drawer openings per day per shop
SELECT 
    'DUPLICATE OPENING' as issue,
    shop_id || ' - ' || DATE(date) as location,
    COUNT(*) as duplicate_count,
    STRING_AGG(TO_CHAR(amount, '9999.99'), ' | ') as amounts
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) > 1
ORDER BY DATE(date) DESC;

-- Show last 20 transactions to see what they look like
SELECT 
    'SAMPLE DATA' as issue,
    shop_id,
    category,
    amount,
    TO_CHAR(date, 'YYYY-MM-DD HH24:MI:SS') as timestamp,
    description
FROM ledger_entries
ORDER BY date DESC
LIMIT 20;

-- Check transactions by month
SELECT 
    'MONTHLY BREAKDOWN' as issue,
    TO_CHAR(date, 'YYYY-MM') as month,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    COUNT(DISTINCT shop_id) as shops,
    MIN(date) as oldest,
    MAX(date) as newest
FROM ledger_entries
GROUP BY TO_CHAR(date, 'YYYY-MM')
ORDER BY month DESC;
