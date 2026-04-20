-- FIND EXACT DUPLICATES IN YOUR DATABASE
-- Run this in Supabase SQL Editor to see what duplicates exist

-- 1. DUPLICATE CASH DRAWER OPENINGS (Same shop, same day)
SELECT 
    'DUPLICATE OPENINGS' as issue_type,
    shop_id,
    DATE(date) as opening_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id, ', ') as duplicate_ids,
    STRING_AGG(TO_CHAR(amount, 'FM9999999.99'), ', ') as amounts
FROM ledger_entries 
WHERE category = 'Cash Drawer Opening'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) > 1
ORDER BY opening_date, shop_id;

-- 2. DOUBLE DEDUCTIONS (Same expense in both ledgers)
SELECT 
    'DOUBLE DEDUCTION' as issue_type,
    le.shop_id,
    le.category as expense_category,
    le.amount,
    le.date as ledger_date,
    ol.created_at as ops_date,
    ol.notes,
    le.id as ledger_id,
    ol.id as ops_id
FROM ledger_entries le
JOIN operations_ledger ol ON 
    ABS(le.amount - ol.amount) < 0.01 AND
    ol.notes LIKE '%Auto-routed from POS expense%'
WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
  AND DATE(le.date) = CURRENT_DATE
  AND DATE(ol.created_at) = CURRENT_DATE
ORDER BY le.shop_id, le.amount;

-- 3. DUPLICATE STAFF SESSIONS (Same employee, same day)
SELECT 
    'DUPLICATE SESSIONS' as issue_type,
    employee_id,
    DATE(created_at) as session_date,
    COUNT(*) as session_count,
    STRING_AGG(id, ', ') as session_ids
FROM staff_sessions
WHERE DATE(created_at) = CURRENT_DATE
GROUP BY employee_id, DATE(created_at)
HAVING COUNT(*) > 1;

-- 4. DUPLICATE SALES (Same transaction, multiple entries)
SELECT 
    'DUPLICATE SALES' as issue_type,
    shop_id,
    client_name,
    total_with_tax,
    DATE(date) as sale_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id, ', ') as sale_ids
FROM sales
WHERE DATE(date) = CURRENT_DATE
GROUP BY shop_id, client_name, total_with_tax, DATE(date)
HAVING COUNT(*) > 1
ORDER BY sale_date, shop_id;

-- 5. SUMMARY OF ALL ISSUES FOUND
SELECT 
    'SUMMARY' as issue_type,
    COUNT(*) as total_issues,
    STRING_AGG(DISTINCT issue_type, ', ') as issue_types
FROM (
    SELECT 'DUPLICATE OPENINGS' as issue_type FROM ledger_entries WHERE category = 'Cash Drawer Opening' GROUP BY shop_id, DATE(date) HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'DOUBLE DEDUCTION' as issue_type FROM ledger_entries le JOIN operations_ledger ol ON ABS(le.amount - ol.amount) < 0.01 WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead') AND DATE(le.date) = CURRENT_DATE AND DATE(ol.created_at) = CURRENT_DATE
) issues;
