import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export type AuditFinding = {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  amount?: number;
  recommendation: string;
  autoAction?: "review" | "flag" | "investigate";
};

export type MoneyAuditResult = {
  timestamp: string;
  period: { start: string; end: string };
  summary: {
    totalSales: number;
    totalExpenses: number;
    totalOpsIncome: number;
    totalOpsExpenses: number;
    netFlow: number;
    vaultDrift: number;
    missingMoney?: number;
  };
  findings: AuditFinding[];
  posOpsCorrelation: {
    matched: number;
    unmatched: number;
    discrepancies: { description: string; amount: number }[];
  };
  deadStockAnalysis: {
    deadStockValue: number;
    daysInStock: number;
    recoverySuggestions: string[];
  };
  overheadAnalysis: {
    contributed: number;
    paid: number;
    net: number;
    flaggedContributions: { shop: string; amount: number; reason: string }[];
  };
  difficultQuestions: {
    question: string;
    context: string;
    severity: "high" | "medium" | "low";
  }[];
};

function toLocalDateString(date: unknown): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(String(date));
  return d.toLocaleDateString('en-CA');
}

export async function runMoneyAudit(daysBack = 30): Promise<MoneyAuditResult> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const periodStart = startDate.toISOString();
  const periodEnd = now.toISOString();

  const findings: AuditFinding[] = [];
  const posOpsDiscrepancies: { description: string; amount: number }[] = [];
  const flaggedContributions: { shop: string; amount: number; reason: string }[] = [];
  const difficultQuestions: { question: string; context: string; severity: "high" | "medium" | "low" }[] = [];

  const [
    salesData,
    ledgerData,
    opsLedgerData,
    opsStateData,
    inventoryData,
    shopsData
  ] = await Promise.all([
    supabaseAdmin.from('sales').select('*').gte('date', periodStart).lte('date', periodEnd).order('date', { ascending: false }).limit(20000),
    supabaseAdmin.from('ledger_entries').select('*').gte('date', periodStart).lte('date', periodEnd).order('date', { ascending: false }).limit(20000),
    supabaseAdmin.from('operations_ledger').select('*').gte('created_at', periodStart).lte('created_at', periodEnd).order('created_at', { ascending: false }).limit(20000),
    supabaseAdmin.from('operations_state').select('*').eq('id', 1).single(),
    supabaseAdmin.from('inventory_items').select('*').limit(10000),
    supabaseAdmin.from('shops').select('*')
  ]);

  const sales = salesData.data || [];
  const ledger = ledgerData.data || [];
  const opsLedger = opsLedgerData.data || [];
  const opsState = opsStateData.data;
  const inventory = inventoryData.data || [];
  const shops = shopsData.data || [];

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalExpenses = ledger
    .filter((l: any) => l.type === 'expense')
    .reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
  
  const opsIncome = opsLedger
    .filter((o: any) => Number(o.amount) > 0)
    .reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const opsExpenses = opsLedger
    .filter((o: any) => Number(o.amount) < 0)
    .reduce((sum: number, o: any) => sum + Math.abs(Number(o.amount || 0)), 0);

  const netFlow = totalSales - totalExpenses + opsIncome - opsExpenses;
  const actualVault = Number(opsState?.actual_balance || 0);
  const computedVault = opsLedger.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const vaultDrift = actualVault - computedVault;

  if (Math.abs(vaultDrift) > 10) {
    findings.push({
      id: 'vault-drift',
      severity: vaultDrift > 100 ? 'critical' : 'warning',
      category: 'Vault Integrity',
      title: `Vault Drift Detected: $${vaultDrift.toFixed(2)}`,
      description: `Actual vault ($${actualVault.toFixed(2)}) differs from computed ($${computedVault.toFixed(2)}) by $${Math.abs(vaultDrift).toFixed(2)}`,
      amount: Math.abs(vaultDrift),
      recommendation: vaultDrift > 0 
        ? "Money in vault but not in ledger entries. Investigate unrecorded deposits."
        : "Ledger shows more than physical vault. Check for unrecorded withdrawals or errors.",
      autoAction: 'investigate'
    });
    
    difficultQuestions.push({
      question: `Where is the $${Math.abs(vaultDrift).toFixed(2)} ${vaultDrift > 0 ? 'extra' : 'missing'}?`,
      context: `Vault drift of $${Math.abs(vaultDrift).toFixed(2)} detected between actual balance and ledger entries`,
      severity: vaultDrift > 100 ? 'high' : 'medium'
    });
  }

  const overheadContributions = opsLedger.filter((o: any) => o.kind === 'overhead_contribution');
  const overheadPayments = opsLedger.filter((o: any) => o.kind === 'overhead_payment');

  const overheadByShop: Record<string, { contributed: number; paid: number }> = {};
  shops.forEach((shop: any) => {
    overheadByShop[shop.id] = { contributed: 0, paid: 0 };
  });

  overheadContributions.forEach((o: any) => {
    if (o.shop_id) {
      overheadByShop[o.shop_id] = overheadByShop[o.shop_id] || { contributed: 0, paid: 0 };
      overheadByShop[o.shop_id].contributed += Number(o.amount || 0);
    }
  });

  overheadPayments.forEach((o: any) => {
    if (o.shop_id) {
      overheadByShop[o.shop_id] = overheadByShop[o.shop_id] || { contributed: 0, paid: 0 };
      overheadByShop[o.shop_id].paid += Math.abs(Number(o.amount || 0));
    }
  });

  Object.entries(overheadByShop).forEach(([shopId, data]) => {
    const shopName = shops.find((s: any) => s.id === shopId)?.name || shopId;
    const net = data.contributed - data.paid;
    
    if (data.contributed > 0 && data.paid === 0 && data.contributed > 500) {
      flaggedContributions.push({
        shop: shopName,
        amount: data.contributed,
        reason: `Contributed $${data.contributed.toFixed(2)} but no overhead payments recorded`
      });
      
      findings.push({
        id: `overhead-imbalance-${shopId}`,
        severity: 'warning',
        category: 'Overhead Tracking',
        title: `${shopName}: Overhead Imbalance`,
        description: `Shop contributed $${data.contributed.toFixed(2)} in overhead but no payments from operations`,
        amount: data.contributed,
        recommendation: `Verify if overhead expenses were paid directly from shop drawer instead of through operations`,
        autoAction: 'review'
      });
    }

    if (net < -100) {
      difficultQuestions.push({
        question: `Why is ${shopName} running a $${Math.abs(net).toFixed(2)} overhead deficit?`,
        context: `Operations paid $${data.paid.toFixed(2)} in overhead but shop only contributed $${data.contributed.toFixed(2)}`,
        severity: Math.abs(net) > 500 ? 'high' : 'medium'
      });
    }
  });

  const posOverheadExpenses = ledger.filter((l: any) => 
    l.type === 'expense' && 
    (l.category === 'Overhead' || String(l.description || '').toLowerCase().includes('rent'))
  );

  const opsOverheadContributions = opsLedger.filter((o: any) => o.kind === 'overhead_contribution');

  const posTotalOverhead = posOverheadExpenses.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
  const opsTotalContributions = opsOverheadContributions.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);

  if (posTotalOverhead > 0 && opsTotalContributions > 0) {
    const overheadDiff = Math.abs(posTotalOverhead - opsTotalContributions);
    const overheadRatio = posTotalOverhead > opsTotalContributions 
      ? opsTotalContributions / posTotalOverhead 
      : posTotalOverhead / opsTotalContributions;

    if (overheadRatio < 0.7 || overheadRatio > 1.3) {
      posOpsDiscrepancies.push({
        description: `Overhead mismatch: POS records $${posTotalOverhead.toFixed(2)} vs Ops records $${opsTotalContributions.toFixed(2)}`,
        amount: overheadDiff
      });

      findings.push({
        id: 'overhead-mismatch',
        severity: overheadDiff > 200 ? 'critical' : 'warning',
        category: 'POS-Ops Reconciliation',
        title: 'Overhead Double-Counting Detected',
        description: `POS overhead expenses ($${posTotalOverhead.toFixed(2)}) don't match Operations contributions ($${opsTotalContributions.toFixed(2)})`,
        amount: overheadDiff,
        recommendation: 'POS overhead entries represent money ROUTING to operations. These should NOT appear as separate expenses in the expense report. Verify POS expense entries are correctly categorized.',
        autoAction: 'flag'
      });

      difficultQuestions.push({
        question: `Is the $${overheadDiff.toFixed(2)} overhead difference double-counted or misclassified?`,
        context: `POS recorded $${posTotalOverhead.toFixed(2)} in overhead but operations only shows $${opsTotalContributions.toFixed(2)} in contributions`,
        severity: overheadDiff > 200 ? 'high' : 'medium'
      });
    }
  }

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const deadStock = inventory.filter((item: any) => {
    const hasRecentSales = sales.some((s: any) => 
      s.item_id === item.id && 
      new Date(s.date) >= sixtyDaysAgo
    );
    const daysInStock = Math.floor((now.getTime() - new Date(item.date_added).getTime()) / (1000 * 3600 * 24));
    return !hasRecentSales && daysInStock > 60 && Number(item.quantity || 0) > 0;
  });

  const deadStockValue = deadStock.reduce((sum: number, item: any) => {
    return sum + (Number(item.landed_cost || 0) * Number(item.quantity || 0));
  }, 0);

  const deadStockQuantity = deadStock.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

  if (deadStockValue > 500) {
    findings.push({
      id: 'dead-stock',
      severity: deadStockValue > 2000 ? 'critical' : 'warning',
      category: 'Inventory Health',
      title: `${deadStock.length} Dead Stock Items Worth $${deadStockValue.toFixed(2)}`,
      description: `${deadStockQuantity} units tied up for 60+ days without sales`,
      amount: deadStockValue,
      recommendation: 'Consider markdown pricing, bundle deals, or liquidation to recover capital',
      autoAction: 'review'
    });

    difficultQuestions.push({
      question: `Can we recover the $${deadStockValue.toFixed(2)} trapped in dead stock?`,
      context: `${deadStock.length} items with ${deadStockQuantity} units haven't sold in 60+ days`,
      severity: deadStockValue > 2000 ? 'high' : 'low'
    });
  }

  const highValueExpenses = ledger.filter((l: any) => 
    l.type === 'expense' && Math.abs(Number(l.amount || 0)) > 300
  );

  if (highValueExpenses.length > 0) {
    const totalHighValue = highValueExpenses.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
    
    findings.push({
      id: 'high-value-expenses',
      severity: totalHighValue > 1000 ? 'warning' : 'info',
      category: 'Expense Review',
      title: `${highValueExpenses.length} High-Value Expenses Total $${totalHighValue.toFixed(2)}`,
      description: 'Expenses over $300 require additional review',
      amount: totalHighValue,
      recommendation: 'Verify each high-value expense has proper documentation and approval',
      autoAction: 'review'
    });

    highValueExpenses.slice(0, 3).forEach((exp: any) => {
      const desc = String(exp.description || 'Unnamed expense');
      if (!desc.toLowerCase().includes('rent') && !desc.toLowerCase().includes('salary')) {
        difficultQuestions.push({
          question: `Is $${Math.abs(Number(exp.amount || 0)).toFixed(2)} for "${desc}" justified?`,
          context: `High-value expense recorded on ${exp.date}`,
          severity: Math.abs(Number(exp.amount || 0)) > 500 ? 'high' : 'medium'
        });
      }
    });
  }

  const shopTotals: Record<string, number> = {};
  sales.forEach((s: any) => {
    const shopId = s.shop_id || 'unknown';
    shopTotals[shopId] = (shopTotals[shopId] || 0) + Number(s.total_with_tax || 0);
  });

  const shopExpenses: Record<string, number> = {};
  ledger.filter((l: any) => l.type === 'expense' && l.shop_id).forEach((l: any) => {
    const shopId = l.shop_id;
    shopExpenses[shopId] = (shopExpenses[shopId] || 0) + Math.abs(Number(l.amount || 0));
  });

  Object.keys(shopTotals).forEach(shopId => {
    const sales_total = shopTotals[shopId] || 0;
    const expenses_total = shopExpenses[shopId] || 0;
    const ratio = expenses_total / sales_total;

    if (ratio > 0.5 && sales_total > 0) {
      const shopName = shops.find((s: any) => s.id === shopId)?.name || shopId;
      findings.push({
        id: `high-expense-ratio-${shopId}`,
        severity: ratio > 0.8 ? 'critical' : 'warning',
        category: 'Shop Efficiency',
        title: `${shopName}: High Expense Ratio (${(ratio * 100).toFixed(1)}%)`,
        description: `Shop expenses ($${expenses_total.toFixed(2)}) are ${(ratio * 100).toFixed(1)}% of sales ($${sales_total.toFixed(2)})`,
        recommendation: 'Review and reduce shop expenses or increase sales volume',
        autoAction: 'investigate'
      });

      difficultQuestions.push({
        question: `Why is ${shopName} spending $${expenses_total.toFixed(2)} on expenses for only $${sales_total.toFixed(2)} in sales?`,
        context: `Expense-to-sales ratio of ${(ratio * 100).toFixed(1)}% exceeds 50% threshold`,
        severity: ratio > 0.8 ? 'high' : 'medium'
      });
    }
  });

  const missingMoney = vaultDrift + deadStockValue;
  if (missingMoney > 100) {
    difficultQuestions.push({
      question: `TOTAL CAPITAL AT RISK: $${missingMoney.toFixed(2)} - Where is this money and how do we recover it?`,
      context: `Vault drift ($${Math.abs(vaultDrift).toFixed(2)}) + Dead stock value ($${deadStockValue.toFixed(2)})`,
      severity: 'high'
    });
  }

  const totalContributed = overheadContributions.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const totalPaid = overheadPayments.reduce((sum: number, o: any) => sum + Math.abs(Number(o.amount || 0)), 0);

  return {
    timestamp: now.toISOString(),
    period: { start: toLocalDateString(startDate), end: toLocalDateString(now) },
    summary: {
      totalSales,
      totalExpenses,
      totalOpsIncome: opsIncome,
      totalOpsExpenses: opsExpenses,
      netFlow,
      vaultDrift,
      missingMoney: missingMoney > 0 ? missingMoney : undefined
    },
    findings,
    posOpsCorrelation: {
      matched: Math.min(posTotalOverhead, opsTotalContributions),
      unmatched: Math.abs(posTotalOverhead - opsTotalContributions),
      discrepancies: posOpsDiscrepancies
    },
    deadStockAnalysis: {
      deadStockValue,
      daysInStock: 60,
      recoverySuggestions: deadStock.length > 0 ? [
        `Bundle ${deadStock.slice(0, 3).map((i: any) => i.name).join(', ')} at 30% off`,
        `Offer dead stock as free add-on with high-margin items`,
        `Consider liquidation sale to recover ${deadStockValue > 1000 ? 'significant' : 'partial'} capital`
      ] : []
    },
    overheadAnalysis: {
      contributed: totalContributed,
      paid: totalPaid,
      net: totalContributed - totalPaid,
      flaggedContributions
    },
    difficultQuestions
  };
}
