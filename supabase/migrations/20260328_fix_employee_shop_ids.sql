-- Fix employee shop_ids to match actual shop IDs
-- Shop IDs: kipasa, dubdub, tradecenter

-- First, let's see what we have
-- SELECT id, name, surname, shop_id FROM employees ORDER BY shop_id;

-- Fix any employees with null or incorrect shop_id
-- This assumes employees need to be assigned based on some criteria

-- Option 1: If you know specific employee IDs, update them:
-- UPDATE employees SET shop_id = 'dubdub' WHERE id = 'specific-employee-id';

-- Option 2: Set a default shop for employees without valid shop_id
UPDATE employees 
SET shop_id = 'kipasa' 
WHERE shop_id IS NULL 
   OR shop_id NOT IN ('kipasa', 'dubdub', 'tradecenter');

-- Option 3: Based on name patterns (adjust as needed)
-- UPDATE employees SET shop_id = 'dubdub' WHERE LOWER(name) LIKE '%dub%' OR LOWER(surname) LIKE '%dub%';
-- UPDATE employees SET shop_id = 'tradecenter' WHERE LOWER(name) LIKE '%trade%' OR LOWER(surname) LIKE '%trade%';

-- Verify the fix
-- SELECT shop_id, COUNT(*) as count FROM employees GROUP BY shop_id;
