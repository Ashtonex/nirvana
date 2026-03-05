-- Add payment_method column to sales table
-- This column tracks whether a sale was paid with Cash or EcoCash

ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';

-- Add constraint to ensure valid payment methods
ALTER TABLE sales ADD CONSTRAINT valid_payment_method 
  CHECK (payment_method IN ('cash', 'ecocash'));

-- Create an index for faster filtering by payment method
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
