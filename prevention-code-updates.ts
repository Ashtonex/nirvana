// PREVENTIVE MEASURES TO STOP FUTURE DUPLICATES
// Add these code updates BEFORE running cleanup scripts

// ========================================
// 1. PREVENT DUPLICATE CASH DRAWER OPENINGS
// ========================================

export async function openCashRegister(input: {
  shopId: string;
  expectedAmount: number;
  actualAmount: number;
  actor: any;
}) {
  const { shopId, expectedAmount, actualAmount, actor } = input;
  const today = new Date().toISOString().split('T')[0];
  
  // PREVENTION: Check if register already opened today
  const { data: existingOpening } = await supabaseAdmin
    .from("ledger_entries")
    .select("*")
    .eq("shop_id", shopId)
    .eq("category", "Cash Drawer Opening")
    .gte("date", `${today}T00:00:00.000Z`)
    .lt("date", `${today}T23:59:59.999Z`)
    .maybeSingle();

  if (existingOpening) {
    throw new Error(`Register already opened today at ${new Date(existingOpening.date).toLocaleTimeString()} by ${existingOpening.description?.split('by')?.[1]?.trim() || 'unknown'}`);
  }

  // Original opening logic continues here...
  const timestamp = new Date().toISOString();
  const discrepancy = actualAmount - expectedAmount;
  
  // ... rest of existing function
}

// ========================================
// 2. PREVENT DOUBLE DEDUCTIONS IN EXPENSE ROUTING
// ========================================

export async function postDrawerToOperations(input: { 
  shopId: string; 
  amount: number; 
  notes?: string; 
  kind?: string 
}) {
  const actor = await requireManagerOrOwner();
  const shopId = String(input?.shopId || "").trim();
  const amount = Number(input?.amount);
  const notes = input?.notes || null;
  const kind = input?.kind || "eod_deposit";

  // PREVENTION: Check if already routed to operations today
  const today = new Date().toISOString().split('T')[0];
  const { data: existingRouting } = await supabaseAdmin
    .from("operations_ledger")
    .select("*")
    .eq("shop_id", shopId)
    .eq("amount", amount)
    .eq("kind", kind)
    .like("notes", "%Auto-routed from POS expense%")
    .gte("created_at", `${today}T00:00:00.000Z`)
    .lt("created_at", `${today}T23:59:59.999Z`)
    .maybeSingle();

  if (existingRouting) {
    throw new Error(`This expense of $${amount.toFixed(2)} was already routed to operations today at ${new Date(existingRouting.created_at).toLocaleTimeString()}`);
  }

  // PREVENTION: Add error handling
  try {
    const timestamp = new Date().toISOString();
    const dayStamp = timestamp.split("T")[0];

    const drawerLedgerId = Math.random().toString(36).substring(2, 9);
    
    // Original routing logic continues...
    const { error: ledgerError } = await supabaseAdmin.from("ledger_entries").insert([{
      id: drawerLedgerId,
      shop_id: shopId,
      type: "transfer",
      category: "Operations Transfer",
      amount,
      date: timestamp,
      description: `Drawer to Operations: ${notes || 'Transfer'}`,
    }]);

    if (ledgerError) {
      throw new Error(`Failed to record ledger entry: ${ledgerError.message}`);
    }

    const { error: opsError } = await supabaseAdmin.from("operations_ledger").insert([{
      title: `Drawer -> Operations (${shopId})`,
      notes: notes || null,
      effectiveDate: dayStamp,
      employeeId: actor.kind === "staff" ? actor.id : null,
      metadata: {
        source: "pos",
        drawerLedgerId
      }
    }]);

    if (opsError) {
      // Rollback ledger entry if operations ledger fails
      await supabaseAdmin.from("ledger_entries").delete().eq("id", drawerLedgerId);
      throw new Error(`Failed to post to operations ledger: ${opsError.message}`);
    }

    return { success: true, drawerLedgerId };

  } catch (error) {
    console.error('Drawer posting failed:', error);
    throw new Error(`Failed to post drawer to operations: ${error.message}`);
  }
}

// ========================================
// 3. PREVENT DUPLICATE SALES
// ========================================

export async function recordSale(saleData: {
  shopId: string;
  clientName: string;
  items: any[];
  total: number;
  paymentMethod: string;
}) {
  const { shopId, clientName, items, total, paymentMethod } = saleData;
  const today = new Date().toISOString().split('T')[0];
  
  // PREVENTION: Check for duplicate sale (same client, same total, same day)
  const { data: existingSale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("shop_id", shopId)
    .eq("client_name", clientName)
    .eq("total_with_tax", total)
    .gte("date", `${today}T00:00:00.000Z`)
    .lt("date", `${today}T23:59:59.999Z`)
    .order("date", { ascending: false })
    .limit(1);

  if (existingSale && existingSale.length > 0) {
    const timeDiff = new Date().getTime() - new Date(existingSale[0].date).getTime();
    // If same sale recorded within 5 minutes, it's likely a duplicate
    if (timeDiff < 5 * 60 * 1000) {
      throw new Error(`Duplicate sale detected: Same client ${clientName} with total $${total.toFixed(2)} was recorded ${Math.floor(timeDiff / 1000)} seconds ago`);
    }
  }

  // Original sale recording logic continues...
}

// ========================================
// 4. PREVENT DUPLICATE STAFF SESSIONS
// ========================================

export async function createStaffSession(employeeId: string, token: string) {
  const today = new Date().toISOString().split('T')[0];
  
  // PREVENTION: Check for existing active session
  const { data: existingSession } = await supabaseAdmin
    .from("staff_sessions")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("token_hash", require("crypto").createHash("sha256").update(token).digest("hex"))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingSession) {
    throw new Error(`Employee ${employeeId} already has an active session (expires ${new Date(existingSession.expires_at).toLocaleString()})`);
  }

  // PREVENTION: Clean up expired sessions for this employee
  await supabaseAdmin
    .from("staff_sessions")
    .delete()
    .eq("employee_id", employeeId)
    .lt("expires_at", new Date().toISOString());

  // Original session creation logic continues...
}

// ========================================
// 5. DATABASE CONSTRAINTS FOR PREVENTION
// ========================================

// Run these in Supabase SQL Editor to add database-level prevention:

/*
-- Add unique constraints to prevent duplicates at database level
ALTER TABLE ledger_entries 
ADD CONSTRAINT unique_daily_opening 
UNIQUE (shop_id, category, DATE(date));

-- Note: This constraint might fail if you have existing duplicates
-- Clean up duplicates first, then add constraints

-- Alternative: Use partial unique constraints
ALTER TABLE ledger_entries 
ADD CONSTRAINT unique_cash_drawer_opening 
UNIQUE (shop_id, DATE(date)) 
WHERE category = 'Cash Drawer Opening';

-- Prevent duplicate operations ledger entries
ALTER TABLE operations_ledger 
ADD CONSTRAINT unique_daily_expense_routing 
UNIQUE (shop_id, amount, DATE(created_at), kind)
WHERE notes LIKE '%Auto-routed from POS expense%';
*/
