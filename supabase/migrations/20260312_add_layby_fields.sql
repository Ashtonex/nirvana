-- Lay-by support fields for quotations
-- These are used by POS lay-by flows to track deposits/installments and contact details.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS client_phone TEXT DEFAULT '';

-- Optional: client_email is used for quote notifications in some flows.
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS client_email TEXT DEFAULT '';

