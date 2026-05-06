import { supabaseAdmin } from "@/lib/supabase";
import { isSavingsOrBlackboxTransferEntry } from "@/lib/transfer-classification";

function startOfDayLocal(dateYYYYMMDD: string) {
  const d = new Date(`${dateYYYYMMDD}T00:00:00`);
  return d.toISOString();
}

function endOfDayLocal(dateYYYYMMDD: string) {
  const d = new Date(`${dateYYYYMMDD}T23:59:59.999`);
  return d.toISOString();
}

function dayBack(dateYYYYMMDD: string, days: number) {
  const d = new Date(`${dateYYYYMMDD}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function toMoney(n: any) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

function isSameDayISO(iso: string | null | undefined, dateYYYYMMDD: string) {
  if (!iso) return false;
  return String(iso).startsWith(dateYYYYMMDD);
}

function isManagerRole(role: string | null | undefined) {
  const r = String(role || "").toLowerCase();
  return r === "owner" || r === "admin" || r === "manager" || r === "lead_manager" || r === "lead manager";
}

export type PosAuditFlag = {
  code: string;
  severity: "info" | "warn" | "critical";
  message: string;
};

export type PosAuditReport = {
  shopId: string;
  date: string;
  generatedAt: string;
  flags: PosAuditFlag[];
  opening: {
    amount: number | null;
    enteredByEmployeeId: string | null;
    enteredByName: string | null;
    entryTimestamp: string | null;
    entryId: string | null;
  };
  expectedOpeningFromPrevClosing: {
    date: string;
    estimatedPrevClosing: number;
  };
  variance: {
    amount: number | null;
    absAmount: number | null;
  };
  totals: {
    salesWithTax: number;
    salesBeforeTax: number;
    tax: number;
    cashSales: number;
    ecocashSales: number;
    laybyCash: number;
    posExpenses: number;
    cashDrawerAdjustmentNet: number;
    estimatedClosingCash: number | null;
  };
  sales: Array<{
    id: string;
    timestamp: string;
    paymentMethod: string;
    employeeId: string | null;
    employeeName: string | null;
    itemName: string;
    qty: number;
    totalWithTax: number;
    tax: number;
  }>;
  expenses: Array<{
    id: string;
    timestamp: string;
    category: string;
    amount: number;
    description: string;
    employeeId: string | null;
    employeeName: string | null;
  }>;
  auditEvents: Array<{
    id: string;
    timestamp: string;
    action: string;
    employeeId: string;
    employeeName: string | null;
    details: any;
  }>;
};

export async function computePosAuditReport(input: { shopId: string; dateYYYYMMDD: string }): Promise<PosAuditReport> {
  const shopId = String(input?.shopId || "").trim();
  const day = String(input?.dateYYYYMMDD || "").trim();
  if (!shopId) throw new Error("Missing shopId");
  if (!day) throw new Error("Missing date");

  const since = startOfDayLocal(day);
  const until = endOfDayLocal(day);
  const prevDay = dayBack(day, 1);
  const sincePrev = startOfDayLocal(prevDay);
  const untilPrev = endOfDayLocal(prevDay);

  const [salesRes, ledgerRes, employeesRes, auditRes, prevSalesRes, prevLedgerRes] = await Promise.all([
    supabaseAdmin
      .from("sales")
      .select("id,shop_id,item_name,quantity,total_with_tax,total_before_tax,tax,date,payment_method,employee_id")
      .eq("shop_id", shopId)
      .gte("date", since)
      .lte("date", until),
    supabaseAdmin
      .from("ledger_entries")
      .select("id,shop_id,type,category,amount,date,description,employee_id")
      .eq("shop_id", shopId)
      .gte("date", since)
      .lte("date", until),
    supabaseAdmin.from("employees").select("id,name,surname,role,shop_id"),
    supabaseAdmin
      .from("audit_log")
      .select("id,timestamp,employee_id,action,details")
      .gte("timestamp", sincePrev)
      .lte("timestamp", until),
    supabaseAdmin
      .from("sales")
      .select("id,shop_id,total_with_tax,date,payment_method")
      .eq("shop_id", shopId)
      .gte("date", sincePrev)
      .lte("date", untilPrev),
    supabaseAdmin
      .from("ledger_entries")
      .select("id,shop_id,type,category,amount,date,description,employee_id")
      .eq("shop_id", shopId)
      .gte("date", sincePrev)
      .lte("date", untilPrev),
  ]);

  const salesRows = (salesRes.data || []) as any[];
  const ledgerRows = (ledgerRes.data || []) as any[];
  const prevSalesRows = (prevSalesRes.data || []) as any[];
  const prevLedgerRows = (prevLedgerRes.data || []) as any[];
  const employees = (employeesRes.data || []) as any[];
  const auditRows = (auditRes.data || []) as any[];

  const employeeMap = new Map<string, string>();
  for (const e of employees) {
    if (!e?.id) continue;
    employeeMap.set(String(e.id), `${e.name || ""} ${e.surname || ""}`.trim() || String(e.id));
  }

  const flags: PosAuditFlag[] = [];

  const openingEntries = ledgerRows
    .filter((l) => String(l?.category || "") === "Cash Drawer Opening" && isSameDayISO(l?.date, day))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (openingEntries.length === 0) flags.push({ code: "OPENING_MISSING", severity: "critical", message: "No Cash Drawer Opening recorded for this day." });
  if (openingEntries.length > 1) flags.push({ code: "OPENING_MULTIPLE", severity: "warn", message: `Multiple openings recorded (${openingEntries.length}). Using earliest.` });

  const openingEntry = openingEntries[0] || null;
  const openingAmount = openingEntry ? toMoney(openingEntry.amount) : null;

  // Attempt to attribute "who entered" by using audit logs (ledger_entries has no employee_id field in this app).
  const openingAuditCandidates = auditRows
    .filter((a) => isSameDayISO(a?.timestamp, day))
    .filter((a) => {
      const action = String(a?.action || "");
      if (!["CASH_DRAWER_OPENED", "CASH_DRAWER_OPENING_SET", "CASH_DRAWER_OPENING_CORRECTED"].includes(action)) return false;
      const details = String(a?.details || "");
      return details.toLowerCase().includes(`${shopId}`.toLowerCase());
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const openingAudit = openingAuditCandidates[0] || null;

  const openingEmployeeId = openingEntry?.employee_id 
    ? String(openingEntry.employee_id) 
    : (openingAudit?.employee_id ? String(openingAudit.employee_id) : null);
  const openingEmployeeName = openingEmployeeId ? employeeMap.get(openingEmployeeId) || openingEmployeeId : null;

  // Previous-day closing estimate (system)
  const prevOpeningEntries = prevLedgerRows
    .filter((l) => String(l?.category || "") === "Cash Drawer Opening" && isSameDayISO(l?.date, prevDay))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (prevOpeningEntries.length === 0) {
    flags.push({
      code: "PREV_OPENING_MISSING",
      severity: "warn",
      message: `No Cash Drawer Opening found for previous day (${prevDay}). Expected opening may be unreliable.`,
    });
  }
  const prevOpeningAmount = prevOpeningEntries[0] ? toMoney(prevOpeningEntries[0].amount) : 0;

  const prevCashSales = prevSalesRows
    .filter((s) => String(s?.payment_method || "").toLowerCase() === "cash" && isSameDayISO(s?.date, prevDay))
    .reduce((sum, s) => sum + toMoney(s?.total_with_tax), 0);

  const prevLaybyCash = prevLedgerRows
    .filter((l) => String(l?.category || "").toLowerCase().startsWith("lay-by") && isSameDayISO(l?.date, prevDay))
    .reduce((sum, l) => sum + toMoney(l?.amount), 0);

  const prevPosExpenses = prevLedgerRows
    .filter((l) => (["POS Expense", "Perfume", "Overhead", "Operations Transfer", "Tithe", "Groceries", "Savings", "Blackbox", "Transfer"].includes(String(l?.category || "")) || isSavingsOrBlackboxTransferEntry(l)) && isSameDayISO(l?.date, prevDay))
    .reduce((sum, l) => sum + toMoney(l?.amount), 0);

  const prevAdjustmentNet = prevLedgerRows
    .filter((l) => String(l?.category || "") === "Cash Drawer Adjustment" && isSameDayISO(l?.date, prevDay))
    .reduce((sum, l) => {
      const amt = toMoney(l?.amount);
      const t = String(l?.type || "").toLowerCase();
      return sum + (t === "income" ? amt : t === "expense" ? -amt : 0);
    }, 0);

  const estimatedPrevClosing = Math.round((prevOpeningAmount + prevCashSales + prevLaybyCash + prevAdjustmentNet - prevPosExpenses) * 100) / 100;
  const expectedOpening = estimatedPrevClosing;

  const variance = openingAmount === null ? null : Math.round((openingAmount - expectedOpening) * 100) / 100;
  const absVar = variance === null ? null : Math.abs(variance);
  if (variance !== null && absVar !== null && absVar > 0.01) {
    flags.push({
      code: "OPENING_VARIANCE",
      severity: absVar >= 20 ? "critical" : "warn",
      message: `Opening differs from previous day's estimated closing by $${absVar.toFixed(2)} (${variance > 0 ? "higher" : "lower"}).`,
    });
  }

  // Totals (selected day)
  const totalWithTax = salesRows.reduce((sum, s) => sum + toMoney(s?.total_with_tax), 0);
  const totalBeforeTax = salesRows.reduce((sum, s) => sum + toMoney(s?.total_before_tax), 0);
  const totalTax = salesRows.reduce((sum, s) => sum + toMoney(s?.tax), 0);
  const totalCash = salesRows.filter((s) => String(s?.payment_method || "").toLowerCase() === "cash").reduce((sum, s) => sum + toMoney(s?.total_with_tax), 0);
  const totalEcocash = salesRows.filter((s) => String(s?.payment_method || "").toLowerCase() === "ecocash").reduce((sum, s) => sum + toMoney(s?.total_with_tax), 0);

  const laybyCash = ledgerRows
    .filter((l) => ['Lay-by Deposit', 'Lay-by Payment', 'Lay-by Completed'].includes(l?.category) && isSameDayISO(l?.date, day))
    .reduce((sum, l) => sum + toMoney(l?.amount), 0);

  const posExpenses = ledgerRows
    .filter((l) => (["POS Expense", "Perfume", "Overhead", "Operations Transfer", "Tithe", "Groceries", "Savings", "Blackbox", "Transfer"].includes(String(l?.category || "")) || isSavingsOrBlackboxTransferEntry(l)) && isSameDayISO(l?.date, day))
    .reduce((sum, l) => sum + toMoney(l?.amount), 0);

  const adjustmentNet = ledgerRows
    .filter((l) => String(l?.category || "") === "Cash Drawer Adjustment" && isSameDayISO(l?.date, day))
    .reduce((sum, l) => {
      const amt = toMoney(l?.amount);
      const t = String(l?.type || "").toLowerCase();
      return sum + (t === "income" ? amt : t === "expense" ? -amt : 0);
    }, 0);

  const estimatedClosingCash =
    openingAmount === null ? null : Math.round((openingAmount + totalCash + laybyCash + adjustmentNet - posExpenses) * 100) / 100;

  // Sales list
  const sales = salesRows
    .filter((s) => isSameDayISO(s?.date, day))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((s) => {
      const employeeId = s?.employee_id ? String(s.employee_id) : null;
      return {
        id: String(s.id),
        timestamp: String(s.date),
        paymentMethod: String(s.payment_method || ""),
        employeeId,
        employeeName: employeeId ? employeeMap.get(employeeId) || employeeId : null,
        itemName: String(s.item_name || "Unknown"),
        qty: Number(s.quantity || 0),
        totalWithTax: toMoney(s.total_with_tax),
        tax: toMoney(s.tax),
      };
    });

  // Build expenseAudit lookup for legacy matching
  const expenseAudit = auditRows
    .filter((a) => isSameDayISO(a?.timestamp, day))
    .filter((a) => String(a?.action || "").toLowerCase().includes("record_pos_expense"));

  // Expenses list - use direct employee_id from ledger, fallback to audit log matching
  const expenses = ledgerRows
    .filter((l) =>
      (String(l?.type || "").toLowerCase() === "expense" || isSavingsOrBlackboxTransferEntry(l)) &&
      isSameDayISO(l?.date, day)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((l) => {
      const amt = toMoney(l?.amount);
      const desc = String(l?.description || "");
      const ts = String(l?.date || "");

      // Use employee_id directly from ledger if available
      let employeeId = l?.employee_id ? String(l.employee_id) : null;
      
      // Fallback: try to match via audit log if no direct employee_id
      if (!employeeId) {
        const match = expenseAudit.find((a) => {
          const details = a?.details;
          const detAmt = toMoney((details && (details.amount ?? details?.[0]?.amount)) ?? 0);
          const detDesc = String((details && (details.description ?? details?.[0]?.description)) ?? "");
          if (detAmt !== amt) return false;
          if (detDesc && desc && detDesc !== desc) return false;
          return true;
        });
        employeeId = match?.employee_id ? String(match.employee_id) : null;
      }

      return {
        id: String(l.id),
        timestamp: ts,
        category: String(l.category || "Expense"),
        amount: amt,
        description: desc,
        employeeId,
        employeeName: employeeId ? employeeMap.get(employeeId) || employeeId : null,
      };
    });

  // Audit events for this day/shop
  const auditEvents = auditRows
    .filter((a) => isSameDayISO(a?.timestamp, day))
    .filter((a) => {
      const action = String(a?.action || "");
      if (action.includes("CASH_DRAWER")) return true;
      if (String(action).toLowerCase().includes("sale")) return true;
      if (String(action).toLowerCase().includes("expense")) return true;
      return false;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((a) => {
      const employeeId = String(a?.employee_id || "SYSTEM");
      return {
        id: String(a.id),
        timestamp: String(a.timestamp),
        action: String(a.action || ""),
        employeeId,
        employeeName: employeeMap.get(employeeId) || null,
        details: a.details,
      };
    });

  // Strictness checks
  const unknownExpenseActors = expenses.filter((e) => e.category === "POS Expense" && !e.employeeId).length;
  if (unknownExpenseActors > 0) {
    flags.push({
      code: "EXPENSE_ACTOR_UNKNOWN",
      severity: "info",
      message: `${unknownExpenseActors} POS expense(s) could not be attributed to a staff member (older records may not have matching audit entries).`,
    });
  }

  // Soft warning when a non-manager entered opening (if we can resolve role)
  if (openingEmployeeId) {
    const role = employees.find((e) => String(e?.id) === openingEmployeeId)?.role;
    if (role && !isManagerRole(String(role))) {
      // It's ok for cashiers to open, but we log it explicitly.
      flags.push({ code: "OPENING_ENTERED_BY_STAFF", severity: "info", message: `Opening recorded by staff role "${String(role)}".` });
    }
  }

  return {
    shopId,
    date: day,
    generatedAt: new Date().toISOString(),
    flags,
    opening: {
      amount: openingAmount,
      enteredByEmployeeId: openingEmployeeId,
      enteredByName: openingEmployeeName,
      entryTimestamp: openingEntry?.date ? String(openingEntry.date) : null,
      entryId: openingEntry?.id ? String(openingEntry.id) : null,
    },
    expectedOpeningFromPrevClosing: {
      date: prevDay,
      estimatedPrevClosing,
    },
    variance: {
      amount: variance,
      absAmount: absVar,
    },
    totals: {
      salesWithTax: totalWithTax,
      salesBeforeTax: totalBeforeTax,
      tax: totalTax,
      cashSales: totalCash,
      ecocashSales: totalEcocash,
      laybyCash,
      posExpenses,
      cashDrawerAdjustmentNet: adjustmentNet,
      estimatedClosingCash,
    },
    sales,
    expenses,
    auditEvents,
  };
}
