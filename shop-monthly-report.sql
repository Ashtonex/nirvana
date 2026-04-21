-- SHOP MONTHLY REVENUE & EXPENSES REPORT
-- Shows total revenue and expenses for each shop in the current month

-- ========================================
-- CURRENT MONTH REVENUE BY SHOP
-- ========================================

SELECT
    'REVENUE SUMMARY' as report_type,
    s.shop_id,
    TO_CHAR(CURRENT_DATE, 'Month YYYY') as month,
    COUNT(*) as total_sales,
    SUM(s.total_with_tax) as total_revenue,
    AVG(s.total_with_tax) as average_sale,
    MAX(s.total_with_tax) as highest_sale,
    MIN(s.total_with_tax) as lowest_sale
FROM sales s
WHERE DATE_TRUNC('month', s.date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY s.shop_id
ORDER BY total_revenue DESC;

-- ========================================
-- CURRENT MONTH EXPENSES BY SHOP
-- ========================================

SELECT
    'EXPENSES SUMMARY' as report_type,
    le.shop_id,
    TO_CHAR(CURRENT_DATE, 'Month YYYY') as month,
    COUNT(*) as total_expenses,
    SUM(le.amount) as total_expenses_amount,
    AVG(le.amount) as average_expense,
    MAX(le.amount) as highest_expense,
    MIN(le.amount) as lowest_expense
FROM ledger_entries le
WHERE le.type = 'expense'
    AND DATE_TRUNC('month', le.date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY le.shop_id
ORDER BY total_expenses_amount DESC;

-- ========================================
-- OPERATIONS LEDGER EXPENSES BY SHOP
-- ========================================

SELECT
    'OPERATIONS EXPENSES' as report_type,
    ol.shop_id,
    TO_CHAR(CURRENT_DATE, 'Month YYYY') as month,
    COUNT(*) as operations_entries,
    SUM(ol.amount) as total_operations_expenses,
    AVG(ol.amount) as average_operations_expense,
    STRING_AGG(DISTINCT ol.kind, ', ') as expense_types
FROM operations_ledger ol
WHERE DATE_TRUNC('month', ol.created_at) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY ol.shop_id
ORDER BY total_operations_expenses DESC;

-- ========================================
-- COMBINED REVENUE VS EXPENSES BY SHOP
-- ========================================

WITH monthly_revenue AS (
    SELECT
        shop_id,
        SUM(total_with_tax) as revenue
    FROM sales
    WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY shop_id
),
monthly_expenses AS (
    SELECT
        shop_id,
        SUM(amount) as expenses
    FROM ledger_entries
    WHERE type = 'expense'
        AND DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY shop_id
),
operations_expenses AS (
    SELECT
        shop_id,
        SUM(amount) as operations_expenses
    FROM operations_ledger
    WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY shop_id
)
SELECT
    'PROFIT & LOSS SUMMARY' as report_type,
    COALESCE(r.shop_id, e.shop_id, o.shop_id) as shop_id,
    TO_CHAR(CURRENT_DATE, 'Month YYYY') as month,
    COALESCE(r.revenue, 0) as total_revenue,
    COALESCE(e.expenses, 0) as ledger_expenses,
    COALESCE(o.operations_expenses, 0) as operations_expenses,
    (COALESCE(e.expenses, 0) + COALESCE(o.operations_expenses, 0)) as total_expenses,
    (COALESCE(r.revenue, 0) - COALESCE(e.expenses, 0) - COALESCE(o.operations_expenses, 0)) as net_profit
FROM monthly_revenue r
FULL OUTER JOIN monthly_expenses e ON r.shop_id = e.shop_id
FULL OUTER JOIN operations_expenses o ON COALESCE(r.shop_id, e.shop_id) = o.shop_id
ORDER BY net_profit DESC;

-- ========================================
-- DAILY BREAKDOWN FOR CURRENT MONTH
-- ========================================

SELECT
    'DAILY PERFORMANCE' as report_type,
    DATE(s.date) as sale_date,
    s.shop_id,
    COUNT(*) as daily_sales_count,
    SUM(s.total_with_tax) as daily_revenue,
    SUM(le.amount) as daily_expenses
FROM sales s
LEFT JOIN ledger_entries le ON
    le.shop_id = s.shop_id
    AND DATE(le.date) = DATE(s.date)
    AND le.type = 'expense'
WHERE DATE_TRUNC('month', s.date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY DATE(s.date), s.shop_id
ORDER BY sale_date DESC, s.shop_id;

-- ========================================
-- SHOP PERFORMANCE RANKING
-- ========================================

WITH shop_performance AS (
    SELECT
        COALESCE(s.shop_id, le.shop_id) as shop_id,
        SUM(COALESCE(s.total_with_tax, 0)) as revenue,
        SUM(CASE WHEN le.type = 'expense' THEN le.amount ELSE 0 END) as expenses,
        COUNT(DISTINCT DATE(COALESCE(s.date, le.date))) as active_days
    FROM sales s
    FULL OUTER JOIN ledger_entries le ON s.shop_id = le.shop_id
        AND DATE_TRUNC('month', s.date) = DATE_TRUNC('month', CURRENT_DATE)
        AND DATE_TRUNC('month', le.date) = DATE_TRUNC('month', CURRENT_DATE)
    WHERE DATE_TRUNC('month', COALESCE(s.date, le.date)) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY COALESCE(s.shop_id, le.shop_id)
)
SELECT
    'SHOP RANKING' as report_type,
    shop_id,
    TO_CHAR(CURRENT_DATE, 'Month YYYY') as month,
    revenue,
    expenses,
    (revenue - expenses) as profit,
    active_days,
    ROUND(revenue / GREATEST(active_days, 1), 2) as avg_daily_revenue,
    ROUND((revenue - expenses) / GREATEST(active_days, 1), 2) as avg_daily_profit,
    RANK() OVER (ORDER BY (revenue - expenses) DESC) as profit_rank
FROM shop_performance
ORDER BY profit_rank;

-- ========================================
-- MONTHLY TREND COMPARISON
-- ========================================

SELECT
    'MONTHLY TREND' as report_type,
    TO_CHAR(DATE_TRUNC('month', s.date), 'Month YYYY') as month,
    s.shop_id,
    COUNT(*) as sales_count,
    SUM(s.total_with_tax) as revenue,
    ROUND(AVG(s.total_with_tax), 2) as avg_sale,
    LAG(SUM(s.total_with_tax)) OVER (PARTITION BY s.shop_id ORDER BY DATE_TRUNC('month', s.date)) as prev_month_revenue,
    ROUND(
        (SUM(s.total_with_tax) - LAG(SUM(s.total_with_tax)) OVER (PARTITION BY s.shop_id ORDER BY DATE_TRUNC('month', s.date))) /
        GREATEST(LAG(SUM(s.total_with_tax)) OVER (PARTITION BY s.shop_id ORDER BY DATE_TRUNC('month', s.date)), 1) * 100,
        2
    ) as revenue_change_percent
FROM sales s
WHERE s.date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '2 months'
GROUP BY DATE_TRUNC('month', s.date), s.shop_id
ORDER BY s.shop_id, DATE_TRUNC('month', s.date) DESC;