-- SHOP SALES BY MONTH REPORT
-- Shows total sales revenue for each shop by month

SELECT
    shop_id,
    TO_CHAR(DATE_TRUNC('month', date), 'Month YYYY') as month,
    COUNT(*) as total_sales_count,
    SUM(total_with_tax) as total_sales_revenue,
    ROUND(AVG(total_with_tax), 2) as average_sale_amount
FROM sales
WHERE date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'  -- Last 6 months
GROUP BY shop_id, DATE_TRUNC('month', date)
ORDER BY shop_id, DATE_TRUNC('month', date) DESC;