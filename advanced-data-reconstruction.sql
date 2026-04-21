-- ADVANCED DATA RECONSTRUCTION - FREE TIER RECOVERY
-- Reconstruct lost data from existing patterns and relationships

-- ========================================
-- STEP 1: ASSESS DAMAGE
-- ========================================

-- Check what we have vs what we should have
SELECT 'Damage Assessment' as status,
       COUNT(*) as current_ledger_entries,
       'Current ledger entries (last 24h)' as note
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Sales Data', COUNT(*), 'Current sales (last 24h)'
FROM sales
WHERE date >= NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 'Operations Ledger', COUNT(*), 'Current ops entries (last 24h)'
FROM operations_ledger
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- ========================================
-- STEP 2: RECONSTRUCT CASH DRAWER OPENINGS
-- ========================================

-- Get historical patterns for each shop
WITH shop_patterns AS (
    SELECT 
        shop_id,
        AVG(amount) as avg_opening,
        EXTRACT(HOUR FROM AVG(date)) as typical_hour,
        COUNT(*) as historical_count
    FROM ledger_entries
    WHERE category = 'Cash Drawer Opening'
      AND date >= NOW() - INTERVAL '30 days'
    GROUP BY shop_id
)
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    sp.shop_id,
    'asset' as type,
    'Cash Drawer Opening' as category,
    COALESCE(sp.avg_opening, 500.00) as amount,
    DATE(NOW()) || ' ' || LPAD(EXTRACT(HOUR FROM sp.typical_hour)::text, 2, '0') || ':00:00' as date,
    'Emergency Recovery - Reconstructed Opening' as description,
    'SYSTEM' as employee_id
FROM shop_patterns sp
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.shop_id = sp.shop_id
      AND le.category = 'Cash Drawer Opening'
      AND DATE(le.date) = DATE(NOW())
);

-- ========================================
-- STEP 3: RECONSTRUCT SALES FROM LEDGER PATTERNS
-- ========================================

-- Look for income entries that might represent lost sales
INSERT INTO sales (id, shop_id, item_id, item_name, quantity, unit_price, total_before_tax, tax, total_with_tax, date, employee_id, client_name, payment_method)
SELECT 
    gen_random_uuid() as id,
    shop_id,
    'recovered_' || MD5(amount || date || shop_id)::text as item_id,
    'Recovered Sale' as item_name,
    1 as quantity,
    amount * 0.87 as unit_price,
    amount * 0.87 as total_before_tax,
    amount * 0.13 as tax,
    amount as total_with_tax,
    date,
    employee_id,
    'Recovered Customer' as client_name,
    'cash' as payment_method
FROM ledger_entries
WHERE type = 'income'
  AND category NOT IN ('Cash Drawer Opening', 'Operations Transfer', 'Cash Drawer Adjustment')
  AND date >= NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
      SELECT 1 FROM sales s
      WHERE s.shop_id = ledger_entries.shop_id
        AND s.total_with_tax = ledger_entries.amount
        AND DATE(s.date) = DATE(ledger_entries.date)
  );

-- ========================================
-- STEP 4: RECONSTRUCT EXPENSES FROM OPERATIONS LEDGER
-- ========================================

-- Create ledger entries for operations ledger items that might be missing
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    ol.shop_id,
    'expense' as type,
    CASE 
        WHEN ol.notes LIKE '%POS expense%' THEN 'POS Expense'
        WHEN ol.notes LIKE '%grocery%' OR ol.notes LIKE '%food%' THEN 'Groceries'
        WHEN ol.notes LIKE '%tithe%' OR ol.notes LIKE '%church%' THEN 'Tithe'
        ELSE 'Overhead'
    END as category,
    ol.amount,
    ol.created_at as date,
    COALESCE(ol.notes, 'Reconstructed Expense') as description,
    ol.employee_id
FROM operations_ledger ol
WHERE ol.created_at >= NOW() - INTERVAL '24 hours'
  AND (ol.notes LIKE '%Auto-routed%' OR ol.notes LIKE '%POS%')
  AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      WHERE le.shop_id = ol.shop_id
        AND ABS(le.amount - ol.amount) < 0.01
        AND DATE(le.date) = DATE(ol.created_at)
        AND le.type = 'expense'
  );

-- ========================================
-- STEP 5: RECONSTRUCT DAILY OPERATIONS PATTERNS
-- ========================================

-- Get typical daily expense patterns for each shop
WITH daily_patterns AS (
    SELECT 
        shop_id,
        category,
        AVG(amount) as avg_amount,
        COUNT(*) as frequency
    FROM ledger_entries
    WHERE type = 'expense'
      AND date >= NOW() - INTERVAL '7 days'
      AND date < NOW() - INTERVAL '1 day'
    GROUP BY shop_id, category
    HAVING COUNT(*) >= 3 -- Only reconstruct frequent expenses
)
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    dp.shop_id,
    'expense' as type,
    dp.category,
    dp.avg_amount,
    DATE(NOW()) || ' ' || LPAD((12 + FLOOR(RANDOM() * 6))::text, 2, '0') || ':00:00' as date,
    'Emergency Recovery - Reconstructed ' || dp.category as description,
    'SYSTEM' as employee_id
FROM daily_patterns dp
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    WHERE le.shop_id = dp.shop_id
      AND le.category = dp.category
      AND DATE(le.date) = DATE(NOW())
);

-- ========================================
-- STEP 6: VERIFICATION AND RECOVERY SUMMARY
-- ========================================

-- Show reconstruction results
SELECT 'Reconstruction Summary' as status,
       COUNT(*) as records_created,
       'Cash drawer openings reconstructed' as note
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
  AND DATE(date) = DATE(NOW())
  AND description LIKE '%Emergency Recovery%'

UNION ALL

SELECT 'Sales Recovery', COUNT(*), 'Sales reconstructed from ledger'
FROM sales
WHERE item_name = 'Recovered Sale'
  AND DATE(date) = DATE(NOW())

UNION ALL

SELECT 'Expense Recovery', COUNT(*), 'Expenses reconstructed'
FROM ledger_entries
WHERE description LIKE '%Emergency Recovery%'
  AND DATE(date) = DATE(NOW());

-- ========================================
-- STEP 7: CASH BALANCE VERIFICATION
-- ========================================

-- Calculate expected vs actual cash balances
SELECT 
    shop_id,
    SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) as openings,
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
    (SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) + 
     SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) - 
     SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)) as expected_balance
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '24 hours'
GROUP BY shop_id
ORDER BY shop_id;

SELECT 'RECONSTRUCTION COMPLETED' as status,
       'Review your cash drawer balances immediately' as action,
       'Verify all critical transactions are restored' as note;
