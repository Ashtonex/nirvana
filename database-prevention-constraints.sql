-- DATABASE LEVEL PREVENTION CONSTRAINTS
-- Run these AFTER cleaning up duplicates to prevent future issues

-- ========================================
-- 1. PREVENT DUPLICATE CASH DRAWER OPENINGS
-- ========================================

-- First, clean up any existing duplicates (run this first)
WITH duplicate_openings AS (
    SELECT 
        shop_id,
        DATE(date) as opening_date,
        MIN(id) as keep_id,
        ARRAY_AGG(id ORDER BY date) as all_ids
    FROM ledger_entries 
    WHERE category = 'Cash Drawer Opening'
    GROUP BY shop_id, DATE(date)
    HAVING COUNT(*) > 1
)
DELETE FROM ledger_entries 
WHERE id IN (
    SELECT unnest(all_ids) FROM duplicate_openings 
    WHERE unnest(all_ids) != keep_id
);

-- Now add the prevention constraint
ALTER TABLE ledger_entries 
ADD CONSTRAINT unique_daily_opening 
UNIQUE (shop_id, category, DATE(date));

-- ========================================
-- 2. PREVENT DUPLICATE OPERATIONS LEDGER ENTRIES
-- ========================================

-- Clean up existing double deductions first
DELETE FROM operations_ledger 
WHERE id IN (
    SELECT DISTINCT ol.id
    FROM operations_ledger ol
    JOIN ledger_entries le ON 
        ABS(le.amount - ol.amount) < 0.01 AND
        ol.notes LIKE '%Auto-routed from POS expense%'
    WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
);

-- Add prevention constraint for operations ledger
ALTER TABLE operations_ledger 
ADD CONSTRAINT unique_daily_expense_routing 
UNIQUE (shop_id, amount, DATE(created_at), kind)
WHERE notes LIKE '%Auto-routed from POS expense%';

-- ========================================
-- 3. PREVENT DUPLICATE SALES
-- ========================================

-- Clean up duplicate sales first
WITH duplicate_sales AS (
    SELECT 
        shop_id,
        client_name,
        total_with_tax,
        DATE(date) as sale_date,
        MIN(id) as keep_id,
        ARRAY_AGG(id ORDER BY date) as all_ids
    FROM sales
    GROUP BY shop_id, client_name, total_with_tax, DATE(date)
    HAVING COUNT(*) > 1
)
DELETE FROM sales 
WHERE id IN (
    SELECT unnest(all_ids) FROM duplicate_sales 
    WHERE unnest(all_ids) != keep_id
);

-- Add prevention constraint for sales
ALTER TABLE sales 
ADD CONSTRAINT unique_daily_sale 
UNIQUE (shop_id, client_name, total_with_tax, DATE(date));

-- ========================================
-- 4. PREVENT DUPLICATE STAFF SESSIONS
-- ========================================

-- Clean up expired sessions
DELETE FROM staff_sessions 
WHERE expires_at < NOW();

-- Add prevention constraint for active sessions
ALTER TABLE staff_sessions 
ADD CONSTRAINT unique_active_session 
UNIQUE (employee_id) 
WHERE expires_at > NOW();

-- ========================================
-- 5. VERIFICATION QUERIES
-- ========================================

-- Verify no duplicates remain
SELECT 'Cash Drawer Openings' as table_name, COUNT(*) as remaining_duplicates
FROM (
    SELECT shop_id, DATE(date), COUNT(*) 
    FROM ledger_entries 
    WHERE category = 'Cash Drawer Opening'
    GROUP BY shop_id, DATE(date)
    HAVING COUNT(*) > 1
) openings

UNION ALL

SELECT 'Operations Ledger' as table_name, COUNT(*) as remaining_duplicates
FROM (
    SELECT shop_id, amount, DATE(created_at), kind, COUNT(*)
    FROM operations_ledger 
    WHERE notes LIKE '%Auto-routed from POS expense%'
    GROUP BY shop_id, amount, DATE(created_at), kind
    HAVING COUNT(*) > 1
) ops

UNION ALL

SELECT 'Sales' as table_name, COUNT(*) as remaining_duplicates
FROM (
    SELECT shop_id, client_name, total_with_tax, DATE(date), COUNT(*)
    FROM sales
    GROUP BY shop_id, client_name, total_with_tax, DATE(date)
    HAVING COUNT(*) > 1
) sales_data

UNION ALL

SELECT 'Staff Sessions' as table_name, COUNT(*) as remaining_duplicates
FROM (
    SELECT employee_id, COUNT(*)
    FROM staff_sessions 
    WHERE expires_at > NOW()
    GROUP BY employee_id
    HAVING COUNT(*) > 1
) sessions;
