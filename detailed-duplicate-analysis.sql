-- DETAILED ANALYSIS OF 4,533 DUPLICATES
-- Run this in Supabase SQL Editor to see exactly what duplicates you have

-- ========================================
-- 1. CASH DRAWER OPENING DUPLICATES
-- ========================================
SELECT 
    'CASH DRAWER OPENINGS' as category,
    shop_id,
    DATE(date) as opening_date,
    COUNT(*) as duplicate_count,
    SUM(amount) as total_amount,
    STRING_AGG(id::text, ', ' ORDER BY date) as duplicate_ids,
    STRING_AGG(TO_CHAR(amount, 'FM9999999.99'), ', ' ORDER BY date) as amounts,
    MIN(date) as first_opening,
    MAX(date) as last_opening
FROM ledger_entries 
WHERE category = 'Cash Drawer Opening'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) > 1
ORDER BY opening_date, shop_id;

-- ========================================
-- 2. DOUBLE DEDUCTIONS (CRITICAL - Affects cash drawer)
-- ========================================
SELECT 
    'DOUBLE DEDUCTIONS' as category,
    le.shop_id,
    le.category as expense_type,
    COUNT(*) as duplicate_count,
    SUM(le.amount) as total_double_deducted,
    STRING_AGG(DISTINCT le.id::text, ', ') as ledger_ids,
    STRING_AGG(DISTINCT ol.id::text, ', ') as ops_ids,
    MIN(le.date) as first_date,
    MAX(le.date) as last_date
FROM ledger_entries le
JOIN operations_ledger ol ON 
    ABS(le.amount - ol.amount) < 0.01 AND
    ol.notes LIKE '%Auto-routed from POS expense%'
WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
GROUP BY le.shop_id, le.category
ORDER BY total_double_deducted DESC;

-- ========================================
-- 3. DUPLICATE SALES TRANSACTIONS
-- ========================================
SELECT 
    'DUPLICATE SALES' as category,
    shop_id,
    client_name,
    total_with_tax,
    DATE(date) as sale_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ' ORDER BY date) as duplicate_ids,
    MIN(date) as first_sale,
    MAX(date) as last_sale,
    (COUNT(*) - 1) * total_with_tax as overcharged_amount
FROM sales
GROUP BY shop_id, client_name, total_with_tax, DATE(date)
HAVING COUNT(*) > 1
ORDER BY overcharged_amount DESC;

-- ========================================
-- 4. DUPLICATE STAFF SESSIONS
-- ========================================
SELECT 
    'DUPLICATE SESSIONS' as category,
    employee_id,
    DATE(created_at) as session_date,
    COUNT(*) as session_count,
    STRING_AGG(id::text, ', ' ORDER BY created_at) as session_ids,
    MIN(created_at) as first_login,
    MAX(created_at) as last_login,
    (COUNT(*) - 1) as extra_sessions
FROM staff_sessions
GROUP BY employee_id, DATE(created_at)
HAVING COUNT(*) > 1
ORDER BY session_date, employee_id;

-- ========================================
-- 5. LEDGER ENTRIES DUPLICATES (Same transaction, multiple entries)
-- ========================================
SELECT 
    'LEDGER DUPLICATES' as category,
    shop_id,
    category,
    amount,
    DATE(date) as entry_date,
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ' ORDER BY date) as duplicate_ids,
    (COUNT(*) - 1) * amount as duplicate_amount
FROM ledger_entries
WHERE category != 'Cash Drawer Opening'  -- Exclude openings already counted
GROUP BY shop_id, category, amount, DATE(date)
HAVING COUNT(*) > 1
ORDER BY duplicate_amount DESC;

-- ========================================
-- 6. FINANCIAL IMPACT SUMMARY
-- ========================================
SELECT 
    'FINANCIAL IMPACT' as category,
    'TOTALS' as metric,
    COUNT(*) as total_duplicates,
    COALESCE(SUM(financial_impact), 0) as total_financial_impact
FROM (
    -- Double deductions impact (expenses counted twice)
    SELECT le.amount as financial_impact
    FROM ledger_entries le
    JOIN operations_ledger ol ON ABS(le.amount - ol.amount) < 0.01
    WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
    
    UNION ALL
    
    -- Duplicate sales impact (customers overcharged)
    SELECT ((COUNT(*) - 1) * total_with_tax) as financial_impact
    FROM sales
    GROUP BY shop_id, client_name, total_with_tax, DATE(date)
    HAVING COUNT(*) > 1
    
    UNION ALL
    
    -- Ledger duplicates impact
    SELECT ((COUNT(*) - 1) * amount) as financial_impact
    FROM ledger_entries
    WHERE category != 'Cash Drawer Opening'
    GROUP BY shop_id, category, amount, DATE(date)
    HAVING COUNT(*) > 1
) impacts;

-- ========================================
-- 7. BREAKDOWN BY SHOP
-- ========================================
SELECT 
    'BY SHOP' as category,
    shop_id,
    SUM(opening_duplicates) as opening_issues,
    SUM(double_deductions) as deduction_issues,
    SUM(sale_duplicates) as sale_issues,
    SUM(session_duplicates) as session_issues,
    SUM(total_issues) as all_issues
FROM (
    SELECT 
        shop_id,
        COUNT(CASE WHEN category = 'Cash Drawer Opening' THEN 1 END) as opening_duplicates,
        0 as double_deductions,
        0 as sale_duplicates,
        0 as session_duplicates,
        COUNT(*) as total_issues
    FROM ledger_entries
    GROUP BY shop_id, DATE(date)
    HAVING COUNT(*) > 1
    
    UNION ALL
    
    SELECT 
        le.shop_id,
        0 as opening_duplicates,
        COUNT(*) as double_deductions,
        0 as sale_duplicates,
        0 as session_duplicates,
        COUNT(*) as total_issues
    FROM ledger_entries le
    JOIN operations_ledger ol ON ABS(le.amount - ol.amount) < 0.01
    WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
    GROUP BY le.shop_id
) all_issues
GROUP BY shop_id
ORDER BY all_issues DESC;
