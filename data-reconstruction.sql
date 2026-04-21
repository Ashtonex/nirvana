-- DATA RECONSTRUCTION SCRIPT - Manual Recovery
-- Use this to rebuild missing data from patterns and manual entry

-- ========================================
-- STEP 1: IDENTIFY MISSING DATA PERIODS
-- ========================================

-- Find days with sales but missing cash drawer data
SELECT
    'MISSING CASH DRAWER DATA' as recovery_type,
    s.shop_id,
    DATE(s.date) as transaction_date,
    COUNT(*) as sales_count,
    SUM(s.total_with_tax) as sales_revenue,
    'Needs cash drawer opening/closing reconstruction' as action_needed
FROM sales s
WHERE DATE(s.date) >= CURRENT_DATE - INTERVAL '30 days'
    AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le
        WHERE le.shop_id = s.shop_id
            AND DATE(le.date) = DATE(s.date)
            AND le.category IN ('Cash Drawer Opening', 'Cash Drawer Closing')
    )
GROUP BY s.shop_id, DATE(s.date)
ORDER BY transaction_date DESC, s.shop_id;

-- ========================================
-- STEP 2: RECONSTRUCT CASH DRAWER OPENINGS
-- ========================================

-- Template for reconstructing cash drawer openings
-- UNCOMMENT AND MODIFY THE VALUES BELOW BASED ON YOUR ACTUAL DATA

/*
-- RECONSTRUCT MISSING CASH DRAWER OPENINGS
-- Replace the dates and amounts with your actual data

INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
VALUES
    -- Example entries - modify with your actual data
    (gen_random_uuid(), 'kipasa', 'asset', 'Cash Drawer Opening', 500.00, '2026-04-20 09:00:00+00', 'Reconstructed - Opening amount', 'SYSTEM'),
    (gen_random_uuid(), 'dubdub', 'asset', 'Cash Drawer Opening', 300.00, '2026-04-20 09:00:00+00', 'Reconstructed - Opening amount', 'SYSTEM'),
    (gen_random_uuid(), 'tradecenter', 'asset', 'Cash Drawer Opening', 1000.00, '2026-04-20 09:00:00+00', 'Reconstructed - Opening amount', 'SYSTEM')
ON CONFLICT (id) DO NOTHING;
*/

-- ========================================
-- STEP 3: RECONSTRUCT MISSING SALES
-- ========================================

-- Template for adding back missing sales
-- Use this if you have paper receipts or remember transactions

/*
-- RECONSTRUCT MISSING SALES
-- Replace with your actual sales data

INSERT INTO sales (id, shop_id, item_id, item_name, quantity, unit_price, total_before_tax, tax, total_with_tax, date, employee_id, client_name, payment_method)
VALUES
    -- Example sales - modify with your actual data
    (gen_random_uuid(), 'kipasa', 'service_manual', 'Manual Sale Entry', 1, 50.00, 50.00, 7.75, 57.75, '2026-04-20 10:30:00+00', 'employee_id_here', 'Walk-in Customer', 'cash'),
    (gen_random_uuid(), 'dubdub', 'service_manual', 'Manual Sale Entry', 1, 75.00, 75.00, 11.63, 86.63, '2026-04-20 11:15:00+00', 'employee_id_here', 'Walk-in Customer', 'cash')
ON CONFLICT (id) DO NOTHING;
*/

-- ========================================
-- STEP 4: RECONSTRUCT MISSING EXPENSES
-- ========================================

-- Template for adding back missing expenses
-- Use this for known expenses like rent, utilities, salaries

/*
-- RECONSTRUCT MISSING EXPENSES
-- Replace with your actual expense data

INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
VALUES
    -- Example expenses - modify with your actual data
    (gen_random_uuid(), 'kipasa', 'expense', 'Rent', 1200.00, '2026-04-01 08:00:00+00', 'Monthly rent payment', 'SYSTEM'),
    (gen_random_uuid(), 'dubdub', 'expense', 'Salaries', 1800.00, '2026-04-01 08:00:00+00', 'Monthly salaries', 'SYSTEM'),
    (gen_random_uuid(), 'tradecenter', 'expense', 'Utilities', 900.00, '2026-04-15 08:00:00+00', 'Monthly utilities', 'SYSTEM')
ON CONFLICT (id) DO NOTHING;
*/

-- ========================================
-- STEP 5: PATTERN-BASED RECONSTRUCTION
-- ========================================

-- Reconstruct cash drawer openings based on previous days' patterns
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT
    gen_random_uuid() as id,
    patterns.shop_id,
    'asset' as type,
    'Cash Drawer Opening' as category,
    COALESCE(patterns.avg_opening_amount, 500.00) as amount,  -- Default to 500 if no pattern
    patterns.missing_date as date,
    'Pattern-based reconstruction - Average of previous openings' as description,
    'SYSTEM' as employee_id
FROM (
    -- Find dates with sales but no cash opening
    SELECT DISTINCT
        s.shop_id,
        DATE(s.date) as missing_date,
        -- Calculate average opening amount from previous 7 days
        (SELECT AVG(amount)
         FROM ledger_entries le
         WHERE le.shop_id = s.shop_id
             AND le.category = 'Cash Drawer Opening'
             AND DATE(le.date) >= DATE(s.date) - INTERVAL '7 days'
             AND DATE(le.date) < DATE(s.date)
        ) as avg_opening_amount
    FROM sales s
    WHERE DATE(s.date) >= CURRENT_DATE - INTERVAL '30 days'
        AND NOT EXISTS (
            SELECT 1 FROM ledger_entries le
            WHERE le.shop_id = s.shop_id
                AND DATE(le.date) = DATE(s.date)
                AND le.category = 'Cash Drawer Opening'
        )
) patterns
WHERE patterns.avg_opening_amount IS NOT NULL  -- Only reconstruct if we have a pattern
ON CONFLICT DO NOTHING;

-- ========================================
-- STEP 6: VERIFICATION
-- ========================================

-- Check reconstruction results
SELECT
    'RECONSTRUCTION RESULTS' as verification_type,
    le.shop_id,
    DATE(le.date) as date,
    COUNT(CASE WHEN le.category = 'Cash Drawer Opening' THEN 1 END) as openings_added,
    COUNT(CASE WHEN le.type = 'income' THEN 1 END) as sales_entries,
    COUNT(CASE WHEN le.type = 'expense' THEN 1 END) as expense_entries,
    'Data reconstruction completed' as status
FROM ledger_entries le
WHERE le.date >= CURRENT_DATE - INTERVAL '30 days'
    AND le.description LIKE '%Reconstructed%' OR le.description LIKE '%Pattern-based%'
GROUP BY le.shop_id, DATE(le.date)
ORDER BY date DESC, le.shop_id;

-- ========================================
-- STEP 7: BALANCE VERIFICATION
-- ========================================

-- Verify that reconstructed data makes sense
SELECT
    'BALANCE CHECK' as verification_type,
    shop_id,
    DATE(date) as transaction_date,
    SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) as opening_amount,
    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expenses,
    (SUM(CASE WHEN type = 'asset' AND category = 'Cash Drawer Opening' THEN amount ELSE 0 END) +
     SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) -
     SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END)) as expected_closing_balance
FROM ledger_entries
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY shop_id, DATE(date)
ORDER BY transaction_date DESC, shop_id;

-- ========================================
-- MANUAL ENTRY TEMPLATE
-- ========================================

/*
MANUAL DATA ENTRY TEMPLATE

For each missing day, enter:

1. CASH DRAWER OPENING:
   - Time: Usually 9:00 AM
   - Amount: Check previous days or use standard amount
   - Description: "Register Opened - Opening amount"

2. SALES:
   - From receipts or memory
   - Include: item, quantity, price, customer, payment method

3. EXPENSES:
   - Regular expenses: rent, salaries, utilities
   - One-time: supplies, repairs, etc.

4. CASH DRAWER CLOSING:
   - Time: Usually 6:00 PM or closing time
   - Amount: Opening + Sales - Expenses
   - Description: "Register Closed - Closing amount"

EXAMPLE ENTRIES:

-- Day: 2026-04-20

-- Opening
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
VALUES (gen_random_uuid(), 'kipasa', 'asset', 'Cash Drawer Opening', 500.00, '2026-04-20 09:00:00+00', 'Register Opened', 'employee_id');

-- Sales
INSERT INTO sales (id, shop_id, item_id, item_name, quantity, unit_price, total_before_tax, tax, total_with_tax, date, employee_id, client_name, payment_method)
VALUES (gen_random_uuid(), 'kipasa', 'item_123', 'Product Name', 1, 50.00, 50.00, 7.75, 57.75, '2026-04-20 10:30:00+00', 'employee_id', 'Customer Name', 'cash');

-- Expenses
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
VALUES (gen_random_uuid(), 'kipasa', 'expense', 'Supplies', 25.00, '2026-04-20 14:00:00+00', 'Office supplies', 'employee_id');

-- Closing
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
VALUES (gen_random_uuid(), 'kipasa', 'asset', 'Cash Drawer Closing', 532.00, '2026-04-20 18:00:00+00', 'Register Closed', 'employee_id');
*/

SELECT 'DATA RECONSTRUCTION COMPLETE' as status,
       'Review and modify the INSERT statements above with your actual data' as next_step;