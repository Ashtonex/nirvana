# EMERGENCY CLEANUP PLAN FOR 4,533 DUPLICATES

## 🚨 CRITICAL: IMMEDIATE ACTION REQUIRED

**4,533 duplicates** are actively affecting your financial accuracy. This is not a "potential" issue - it's happening now.

---

## 📊 STEP 1: RUN DETAILED ANALYSIS

**Execute `detailed-duplicate-analysis.sql` in Supabase SQL Editor**

This will show you:
- **Cash Drawer Opening Duplicates** - Multiple daily openings per shop
- **Double Deductions** - Expenses counted twice (MOST CRITICAL)
- **Duplicate Sales** - Customers overcharged
- **Duplicate Sessions** - Staff login issues
- **Financial Impact** - Actual money affected

---

## 🎯 STEP 2: IDENTIFY PRIORITY FIXES

**IMMEDIATE (Today):**
1. **Double Deductions** - These are stealing money from your cash drawer
2. **Duplicate Sales** - Overcharging customers (legal risk)
3. **Cash Drawer Openings** - Confusing daily totals

**HIGH (This Week):**
4. **Staff Sessions** - Access control issues
5. **Ledger Duplicates** - General data integrity

---

## 🔧 STEP 3: EXECUTE CLEANUP SCRIPTS

### **SCRIPT A: Fix Double Deductions (URGENT)**
```sql
-- Remove duplicate operations_ledger entries for expenses already in ledger_entries
DELETE FROM operations_ledger 
WHERE id IN (
    SELECT DISTINCT ol.id
    FROM operations_ledger ol
    JOIN ledger_entries le ON 
        ABS(le.amount - ol.amount) < 0.01 AND
        ol.notes LIKE '%Auto-routed from POS expense%'
    WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
);
```

### **SCRIPT B: Fix Duplicate Cash Drawer Openings**
```sql
-- Keep only earliest opening per shop per day
WITH duplicate_openings AS (
    SELECT 
        shop_id,
        DATE(date) as opening_date,
        MIN(id) as keep_id,
        ARRAY_AGG(id ORDER BY date) as all_ids
    FROM ledger_entries 
    WHERE category = 'Cash Drawer Opening'
    GROUP BY shop_id, DATE(date)
    HAVING COUNT(*) > 1
)
DELETE FROM ledger_entries 
WHERE id IN (
    SELECT unnest(all_ids) FROM duplicate_openings 
    WHERE unnest(all_ids) != keep_id
);
```

### **SCRIPT C: Fix Duplicate Sales**
```sql
-- Keep only earliest sale per customer per amount per day
WITH duplicate_sales AS (
    SELECT 
        shop_id,
        client_name,
        total_with_tax,
        DATE(date) as sale_date,
        MIN(id) as keep_id,
        ARRAY_AGG(id ORDER BY date) as all_ids
    FROM sales
    GROUP BY shop_id, client_name, total_with_tax, DATE(date)
    HAVING COUNT(*) > 1
)
DELETE FROM sales 
WHERE id IN (
    SELECT unnest(all_ids) FROM duplicate_sales 
    WHERE unnest(all_ids) != keep_id
);
```

---

## ⚠️ CRITICAL WARNINGS

### **BEFORE RUNNING CLEANUP:**
1. **BACKUP DATABASE** - Supabase does this automatically, but verify
2. **EXPORT CURRENT DATA** - Download CSV of critical tables
3. **NOTIFY USERS** - System will be briefly read-only during cleanup
4. **PLAN MAINTENANCE WINDOW** - Do this during low-traffic hours

### **RISKS:**
- **Temporary ledger inconsistencies** during cleanup (2-5 minutes)
- **Brief system restart** if redeploying code fixes
- **User confusion** if transactions disappear (they're duplicates, but users may notice)

---

## 📋 VERIFICATION CHECKLIST

**After running cleanup scripts:**

### **Immediate Verification:**
- [ ] Re-run duplicate analysis - should show 0 issues
- [ ] Check cash drawer totals - should be accurate
- [ ] Verify recent sales - no duplicates visible
- [ ] Test expense posting - no double deductions

### **Business Verification:**
- [ ] Compare today's cash drawer with physical cash
- [ ] Review recent expense reports for accuracy
- [ ] Check customer complaints about overcharging
- [ ] Verify staff can log in properly

---

## 🚀 PREVENTION MEASURES

### **Code Fixes Needed:**
```typescript
// 1. Add duplicate prevention in cash drawer opening
export async function openCashRegister(input: {...}) {
  // Check if already opened today
  const existing = await supabaseAdmin
    .from("ledger_entries")
    .select("*")
    .eq("shop_id", shopId)
    .eq("category", "Cash Drawer Opening")
    .gte("date", today + "T00:00:00.000Z")
    .lt("date", today + "T23:59:59.999Z");
    
  if (existing.data.length > 0) {
    throw new Error("Register already opened today");
  }
  // ... rest of function
}

// 2. Add error handling to prevent double routing
export async function postDrawerToOperations(input: {...}) {
  try {
    // Check if already routed
    const existing = await supabaseAdmin
      .from("operations_ledger")
      .select("*")
      .eq("amount", amount)
      .eq("notes", "Auto-routed from POS expense")
      .gte("created_at", new Date().toISOString().split('T')[0]);
      
    if (existing.data.length > 0) {
      throw new Error("Expense already routed to operations");
    }
    // ... rest of function
  } catch (error) {
    console.error('Drawer posting failed:', error);
    throw error;
  }
}
```

### **Database Constraints:**
```sql
-- Add unique constraints to prevent future duplicates
ALTER TABLE ledger_entries 
ADD CONSTRAINT unique_daily_opening 
UNIQUE (shop_id, category, DATE(date));

ALTER TABLE sales 
ADD CONSTRAINT unique_daily_sale 
UNIQUE (shop_id, client_name, total_with_tax, DATE(date));
```

---

## 🎯 EXECUTION ORDER

1. **Run detailed analysis** (2 minutes)
2. **Backup verification** (1 minute)  
3. **Execute cleanup scripts** (5-10 minutes)
4. **Verify results** (2 minutes)
5. **Test functionality** (5 minutes)
6. **Deploy prevention code** (10 minutes)

**Total estimated time: 25-30 minutes**

---

## 🆘 EMERGENCY CONTACTS

If something goes wrong during cleanup:
1. **Stop immediately** - Don't continue if errors occur
2. **Restore backup** - Use Supabase point-in-time recovery
3. **Contact support** - Document exactly what failed
4. **Manual verification** - Check physical cash vs system totals

---

**BOTTOM LINE:** 4,533 duplicates is a critical business issue affecting your finances. This needs immediate attention, not postponement.
