# Lay-by Sale Error Fix - Completed

## Issues Fixed

### Fix 1: Backup Download API Route ✅
- Added `export const dynamic = 'force-dynamic';` to `app/api/backups/download/route.ts`
- This resolves the build error: "export const dynamic = "force-static"/export const revalidate not configured on route"

### Fix 2: Database Schema (Requires Manual Action) ⚠️
- The `quotations` table needs a `paid_amount` column for lay-by functionality

---

## Supabase SQL Migration (Run this in your Supabase Dashboard)

Go to your Supabase Dashboard → SQL Editor and run:

```sql
-- Add paid_amount column to quotations table for lay-by functionality
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- Also add client_phone column if it doesn't exist (required for lay-by)
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS client_phone TEXT DEFAULT '';

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'quotations' 
AND column_name IN ('paid_amount', 'client_phone', 'client_email')
ORDER BY column_name;
```

---

## After Running the SQL

1. Redeploy your app to Vercel
2. Test the lay-by sale functionality

---

## Summary

| Issue | Status | Action Required |
|-------|--------|-----------------|
| Build error (backup route) | ✅ Fixed | Redeploy to Vercel |
| Missing `paid_amount` column | ⚠️ Pending | Run SQL in Supabase |
| Missing `client_phone` column | ⚠️ Pending | Run SQL in Supabase |

