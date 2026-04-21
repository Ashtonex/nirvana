# Data Recovery Plan - No Backup Required

## 🎯 YOUR SITUATION
- ❌ No Supabase backups (free tier)
- ❌ Prevention code deleted or corrupted data
- ❌ Records now inaccurate, dates messed up
- ✅ Database still exists with residual data

## 🚨 RECOVERY STRATEGY (4 Steps)

### STEP 1: Run Diagnostic (2 minutes)
**Location**: Supabase Dashboard → SQL Editor

1. Copy everything from: `recovery-diagnostic.sql`
2. Paste into Supabase SQL Editor
3. Click "Run"
4. Review the results - this tells us exactly what's missing

**What to look for:**
- `MISSING OPENINGS` - Cash drawer openings that didn't record
- `LOW TRANSACTION DAYS` - Days with suspiciously few transactions
- `CURRENT DUPLICATES` - Remaining duplicates from prevention code
- `LOW SALES DAYS` - Days with no/few sales

---

### STEP 2: Check Activity Log
**Location**: Supabase Dashboard → Settings → Activity

1. Look for DELETE operations in past 48 hours
2. Note the timestamps
3. This tells us exactly WHEN data was deleted
4. Supabase retains activity for 7 days

---

### STEP 3: Attempt SQL Recovery
Once you know what's missing, run recovery SQL:

#### **Option A: Restore Missing Cash Drawer Openings**
```sql
-- Add back today's opening if it's missing
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    'SHOP_NAME' as shop_id,  -- Replace with your shop ID
    'asset' as type,
    'Cash Drawer Opening' as category,
    500.00 as amount,  -- Replace with actual amount
    NOW() as date,
    'Recovered - Manual Re-entry' as description,
    'SYSTEM' as employee_id
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_entries 
    WHERE shop_id = 'SHOP_NAME'
        AND category = 'Cash Drawer Opening'
        AND DATE(date) = CURRENT_DATE
)
```

#### **Option B: Restore from Yesterday's Pattern**
```sql
-- Recreate today's opening based on yesterday's pattern
INSERT INTO ledger_entries (id, shop_id, type, category, amount, date, description, employee_id)
SELECT 
    gen_random_uuid() as id,
    shop_id,
    'asset' as type,
    'Cash Drawer Opening' as category,
    amount,  -- Use yesterday's opening amount
    NOW() as date,
    'Recovered from previous day pattern' as description,
    'SYSTEM' as employee_id
FROM ledger_entries
WHERE DATE(date) = CURRENT_DATE - INTERVAL '1 day'
    AND category = 'Cash Drawer Opening'
    AND NOT EXISTS (
        SELECT 1 FROM ledger_entries le2
        WHERE le2.shop_id = ledger_entries.shop_id
            AND le2.category = 'Cash Drawer Opening'
            AND DATE(le2.date) = CURRENT_DATE
    )
```

#### **Option C: Remove Duplicate Openings (SAFE - no deletion)**
```sql
-- View duplicates first
SELECT shop_id, DATE(date) as opening_date, COUNT(*) as count, 
       STRING_AGG(id::text, ', ') as duplicate_ids
FROM ledger_entries
WHERE category = 'Cash Drawer Opening'
GROUP BY shop_id, DATE(date)
HAVING COUNT(*) > 1;

-- If you need to remove duplicates, run this (keeps first one):
-- DELETE FROM ledger_entries 
-- WHERE category = 'Cash Drawer Opening'
--   AND id NOT IN (
--     SELECT DISTINCT ON (shop_id, DATE(date)) id
--     FROM ledger_entries
--     WHERE category = 'Cash Drawer Opening'
--     ORDER BY shop_id, DATE(date), date ASC
--   );
```

---

### STEP 4: Verify Recovery
```sql
-- Check totals before/after
SELECT 
    DATE(date) as transaction_date,
    shop_id,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount
FROM ledger_entries
WHERE date >= NOW() - INTERVAL '3 days'
GROUP BY DATE(date), shop_id
ORDER BY transaction_date DESC;
```

---

## ⚠️ IMPORTANT NOTES

**What we CAN recover:**
- ✅ Missing cash drawer openings (pattern-based)
- ✅ Missing daily summaries
- ✅ Remove duplicate entries that prevention code created

**What we CANNOT recover:**
- ❌ Specific transaction details if completely deleted (without timestamps)
- ❌ Original timestamps if overwritten
- ❌ Cash amounts if not logged elsewhere

---

## 🔧 NEXT STEPS AFTER RECOVERY

### 1. Fix the Prevention Code
The prevention code in `app/actions.ts` needs refinement:
- Current: Throws error if duplicate detected
- Better: Log warning, check if it's actually a duplicate, merge if needed

### 2. Add Safeguards
```typescript
// Before running cleanup SQL, add:
// 1. --dry-run flag to preview deletions
// 2. Confirmation prompt
// 3. Timestamp backup
// 4. Audit logging for all deletes
```

### 3. Upgrade Supabase Plan
Free tier has no backups. Consider:
- **Pro Plan ($25/month)**: Daily backups
- **Business Plan**: Real-time backups + PITR (Point-in-Time Recovery)

---

## 📋 QUICK CHECKLIST

- [ ] Run `recovery-diagnostic.sql` → Take screenshot
- [ ] Check Supabase Activity Log → Find delete events
- [ ] Identify missing data from diagnostic results
- [ ] Run appropriate recovery SQL option (A, B, or C)
- [ ] Run verification query to confirm recovery
- [ ] Document what was recovered
- [ ] Fix prevention code to be less aggressive
- [ ] Test thoroughly before next deployment

---

## 🆘 IF STILL STUCK

You have data in your local code references. Check:
- `detailed-duplicate-analysis.sql` - lists what the duplicates were
- `find-duplicates.sql` - shows duplicate patterns
- Terminal history / logs showing what was deleted
- Local git history if files were modified

Tell me **what specific data is missing** (cash openings, sales, dates, amounts) and I can write targeted recovery SQL.
