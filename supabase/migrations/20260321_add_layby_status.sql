-- Add 'layby' status to quotations check constraint
DO $$
BEGIN
    -- Try to drop the existing constraint and recreate with layby
    ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
EXCEPTION
    WHEN undefined_object THEN
        RAISE NOTICE 'Constraint quotations_status_check does not exist';
END
$$;

ALTER TABLE quotations ADD CONSTRAINT quotations_status_check
    CHECK (status IN ('pending', 'quoted', 'converted', 'layby', 'cancelled'));
