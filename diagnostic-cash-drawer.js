const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Oracle validation functions
const POS_EXPENSE_CATEGORIES = ["POS Expense", "Perfume", "Overhead"];

async function getExpenses(shopId, since) {
  let query = supabase
    .from("ledger_entries")
    .select("id, category, amount, date, shop_id, type, description");

  if (shopId) query = query.eq("shop_id", shopId);
  if (since) query = query.gte("date", since);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getOpsLedger(shopId) {
  let query = supabase.from("operations_ledger").select("*");
  if (shopId) query = query.eq("shop_id", shopId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getInvestDeposits(shopId) {
  let query = supabase.from("invest_deposits").select("*");
  if (shopId) query = query.eq("shop_id", shopId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function validateCashDrawerIntegrity(shopId) {
  const issues = [];

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const sinceStr = since.toISOString();

  const [expenses, opsLedger, investDeposits] = await Promise.all([
    getExpenses(shopId, sinceStr),
    getOpsLedger(shopId),
    getInvestDeposits(shopId),
  ]);

  const posExpenses = expenses.filter(e =>
    POS_EXPENSE_CATEGORIES.includes(e.category)
  );
  const totalPosExpenses = posExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const todayOpsPosts = opsLedger.filter(op => {
    const opDate = String(op.effective_date || "").split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    return opDate === today &&
      !["POS Expense", "Perfume", "Overhead"].includes(String(op.category || "")) &&
      (op.kind === "eod_deposit" || op.kind === "overhead_payment");
  });
  const totalOpsPosts = todayOpsPosts.reduce((sum, op) => sum + Number(op.amount || 0), 0);

  const opsExpenseAmounts = new Set(
    opsLedger
      .filter(op => op.notes?.includes("Auto-routed from POS expense"))
      .map(op => `${op.amount}-${op.created_at}`)
  );

  let doubleCounted = 0;
  for (const expense of posExpenses) {
    const key = `${expense.amount}-${expense.date}`;
    if (opsExpenseAmounts.has(key)) {
      doubleCounted += Number(expense.amount);
    }
  }

  if (doubleCounted > 0) {
    issues.push({
      severity: "error",
      code: "CASH_DRAWER_DOUBLE_DEDUCTION",
      message: `$${doubleCounted.toFixed(2)} in POS expenses appear to be double-counted between ledger_entries and operations_ledger.`,
      table: "cash_drawer",
      hint: "Verify that todaysOpsPosts excludes POS/Perfume/Overhead categories.",
    });
  }

  return issues;
}

async function checkCashDrawerOpenings(shopId) {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: openings, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("shop_id", shopId)
    .eq("category", "Cash Drawer Opening")
    .gte("date", today + "T00:00:00.000Z")
    .lte("date", today + "T23:59:59.999Z")
    .order("date", { ascending: true });

  if (error) throw error;

  const issues = [];
  
  if (!openings || openings.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_TODAY_OPENING",
      message: "No cash drawer opening recorded for today",
      hint: "Register needs to be opened before processing sales"
    });
  } else if (openings.length > 1) {
    issues.push({
      severity: "warning", 
      code: "MULTIPLE_OPENINGS",
      message: `Multiple cash drawer openings found today: ${openings.length}`,
      hint: "This may indicate duplicate opening entries"
    });
  }

  return { openings: openings || [], issues };
}

async function main() {
  try {
    console.log("🔍 Running Cash Drawer Diagnostic...\n");

    // Get all shops
    const { data: shops, error: shopsError } = await supabase
      .from("shops")
      .select("id, name");

    if (shopsError) throw shopsError;

    if (!shops || shops.length === 0) {
      console.log("❌ No shops found in the system");
      return;
    }

    console.log(`📊 Found ${shops.length} shop(s) to analyze\n`);

    for (const shop of shops) {
      console.log(`🏪 Analyzing Shop: ${shop.name} (${shop.id})`);
      console.log("=" .repeat(50));

      // Check cash drawer openings
      const { openings, issues: openingIssues } = await checkCashDrawerOpenings(shop.id);
      
      if (openingIssues.length > 0) {
        console.log("⚠️  Opening Issues:");
        openingIssues.forEach(issue => {
          console.log(`   ${issue.code}: ${issue.message}`);
        });
      } else {
        console.log("✅ Cash drawer openings look good");
        if (openings.length > 0) {
          console.log(`   Today's opening: $${Number(openings[0].amount).toFixed(2)} at ${openings[0].date}`);
        }
      }

      // Check for double deductions
      const drawerIssues = await validateCashDrawerIntegrity(shop.id);
      
      if (drawerIssues.length > 0) {
        console.log("🚨 Double Deduction Issues:");
        drawerIssues.forEach(issue => {
          console.log(`   ${issue.code}: ${issue.message}`);
        });
      } else {
        console.log("✅ No double deductions detected");
      }

      console.log("\n");
    }

    console.log("✅ Diagnostic complete!");

  } catch (error) {
    console.error("❌ Diagnostic failed:", error.message);
    console.error(error.stack);
  }
}

main();
