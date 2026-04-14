import { supabaseAdmin } from "@/lib/supabase";

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

export type FinancialHealthScore = {
  overall: number;
  liquidity: number;
  profitability: number;
  efficiency: number;
  growth: number;
  taxCompliance: number;
  breakdown: {
    metric: string;
    score: number;
    status: "excellent" | "good" | "warning" | "critical";
    insight: string;
  }[];
};

export type MoneyRecommendation = {
  id: string;
  type: "allocation" | "savings" | "investment" | "expense" | "tax" | "growth";
  priority: "urgent" | "high" | "medium" | "low";
  title: string;
  description: string;
  potentialImpact: number;
  riskLevel: "low" | "medium" | "high";
  actionSteps: string[];
  roiEstimate?: number;
};

export type LearningInsight = {
  pattern: string;
  confidence: number;
  historicalData: number;
  trend: "improving" | "stable" | "declining";
  prediction: string;
};

export type TaxOptimization = {
  opportunity: string;
  estimatedSavings: number;
  complianceRisk: "low" | "medium" | "high";
  action: string;
  deadline?: string;
};

export type RealExpenseAnalysis = {
  totalRealExpenses: number;
  internalTransfers: number;
  personalExpenses: number;
  groceryExpenses: number;
  smallExpenses: number;
  overheadExpenses: number;
  miscExpenses: number;
  expenseBreakdown: Record<string, { total: number; count: number; avg: number }>;
  flaggedItems: {
    id: string;
    source: string;
    amount: number;
    title: string;
    category: string;
    flagReason: string;
    flagType: "abnormal" | "unusual" | "recurring";
  }[];
  insights: {
    type: "info" | "warning" | "tip";
    message: string;
  }[];
};

const INTERNAL_TRANSFER_PATTERNS = [
  "invest", "savings", "perfume", "deposit to", "transfer to",
  "stockvel", "operations", "overhead contribution", "perfume invest"
];

const PERSONAL_EXPENSE_PATTERNS = [
  "personal", "抽钱", "withdrawal", "own", "my ", " me ", "family",
  "home", "lunch for home", "dinner for home", "breakfast for home"
];

const GROCERY_PATTERNS = [
  "groceries", "grocery", "food for home", "supermarket", "market", "provisions"
];

const SMALL_EXPENSE_PATTERNS = [
  "airtime", "data", "transport", "petrol", "fuel", "lunch", "snacks",
  "coffee", "water", "parking", "toll", "sms", "bus fare", "minibus"
];

function classifyExpenseEntry(
  title: string,
  category: string,
  amount: number
): {
  isInternalTransfer: boolean;
  isPersonal: boolean;
  expenseType: "groceries" | "small" | "overhead" | "other";
  classification: string;
} {
  const text = `${title || ""} ${category || ""}`.toLowerCase();

  const isInternalTransfer = INTERNAL_TRANSFER_PATTERNS.some(p => text.includes(p));
  if (isInternalTransfer) {
    return { isInternalTransfer: true, isPersonal: false, expenseType: "other", classification: "internal_transfer" };
  }

  const isPersonal = PERSONAL_EXPENSE_PATTERNS.some(p => text.includes(p));
  if (isPersonal) {
    return { isInternalTransfer: false, isPersonal: true, expenseType: "other", classification: "personal" };
  }

  const expenseType: "groceries" | "small" | "overhead" | "other" =
    GROCERY_PATTERNS.some(p => text.includes(p)) ? "groceries" :
    SMALL_EXPENSE_PATTERNS.some(p => text.includes(p)) ? "small" :
    ["rent", "utilities", "electric", "water", "wages", "salary", "rates"].some(p => text.includes(p)) ? "overhead" :
    "other";

  return { isInternalTransfer: false, isPersonal: false, expenseType, classification: expenseType };
}

function toLocalDateString(date: unknown): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date instanceof Date ? date : new Date(String(date));
  return d.toLocaleDateString('en-CA');
}

export async function runEnhancedMoneyAudit(daysBack = 30): Promise<{
  audit: MoneyAuditResult;
  healthScore: FinancialHealthScore;
  recommendations: MoneyRecommendation[];
  learningInsights: LearningInsight[];
  taxOptimizations: TaxOptimization[];
  cashFlowForecast: { day: number; predicted: number; confidence: number }[];
  benchmarkComparison: { metric: string; current: number; historical: number; change: number }[];
}> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const periodStart = startDate.toISOString();
  const periodEnd = now.toISOString();

  const [salesData, ledgerData, opsLedgerData, opsStateData, inventoryData, shopsData, historicalData] = await Promise.all([
    supabaseAdmin.from('sales').select('*').gte('date', periodStart).lte('date', periodEnd),
    supabaseAdmin.from('ledger_entries').select('*').gte('date', periodStart).lte('date', periodEnd),
    supabaseAdmin.from('operations_ledger').select('*').gte('created_at', periodStart).lte('created_at', periodEnd),
    supabaseAdmin.from('operations_state').select('*').eq('id', 1).single(),
    supabaseAdmin.from('inventory_items').select('*'),
    supabaseAdmin.from('shops').select('*'),
    supabaseAdmin.from('sales').select('total_with_tax, date').order('date', { ascending: true }).limit(5000)
  ]);

  const sales = salesData.data || [];
  const ledger = ledgerData.data || [];
  const opsLedger = opsLedgerData.data || [];
  const opsState = opsStateData.data;
  const inventory = inventoryData.data || [];
  const shops = shopsData.data || [];
  const historicalSales = historicalData.data || [];

  const findings: AuditFinding[] = [];
  const posOpsDiscrepancies: { description: string; amount: number }[] = [];
  const flaggedContributions: { shop: string; amount: number; reason: string }[] = [];
  const difficultQuestions: { question: string; context: string; severity: "high" | "medium" | "low" }[] = [];
  const recommendations: MoneyRecommendation[] = [];
  const learningInsights: LearningInsight[] = [];
  const taxOptimizations: TaxOptimization[] = [];

  const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const totalExpenses = ledger.filter((l: any) => l.type === 'expense').reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
  const opsIncome = opsLedger.filter((o: any) => Number(o.amount) > 0).reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const opsExpenses = opsLedger.filter((o: any) => Number(o.amount) < 0).reduce((sum: number, o: any) => sum + Math.abs(Number(o.amount || 0)), 0);
  const netFlow = totalSales - totalExpenses + opsIncome - opsExpenses;

  const actualVault = Number(opsState?.actual_balance || 0);
  const computedVault = opsLedger.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const vaultDrift = actualVault - computedVault;

  if (Math.abs(vaultDrift) > 10) {
    findings.push({
      id: 'vault-drift',
      severity: vaultDrift > 100 ? 'critical' : 'warning',
      category: 'Vault Integrity',
      title: `Vault Drift: $${vaultDrift.toFixed(2)}`,
      description: `Actual: $${actualVault.toFixed(2)} | Computed: $${computedVault.toFixed(2)}`,
      amount: Math.abs(vaultDrift),
      recommendation: vaultDrift > 0 ? "Unrecorded deposits detected" : "Possible unrecorded withdrawals",
      autoAction: 'investigate'
    });
    difficultQuestions.push({ question: `Where is $${Math.abs(vaultDrift).toFixed(2)} ${vaultDrift > 0 ? 'extra' : 'missing'}?`, context: 'Vault reconciliation failed', severity: vaultDrift > 100 ? 'high' : 'medium' });
  }

  const profitMargin = totalSales > 0 ? ((totalSales - totalExpenses) / totalSales) * 100 : 0;
  const overheadContributions = opsLedger.filter((o: any) => o.kind === 'overhead_contribution');
  const overheadPayments = opsLedger.filter((o: any) => o.kind === 'overhead_payment');
  const totalContributed = overheadContributions.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
  const totalPaid = overheadPayments.reduce((sum: number, o: any) => sum + Math.abs(Number(o.amount || 0)), 0);

  if (profitMargin < 10 && totalSales > 1000) {
    findings.push({
      id: 'low-profit-margin',
      severity: profitMargin < 0 ? 'critical' : 'warning',
      category: 'Profitability',
      title: `Low Profit Margin: ${profitMargin.toFixed(1)}%`,
      description: `Net profit of $${(totalSales - totalExpenses).toFixed(2)} on $${totalSales.toFixed(2)} sales`,
      recommendation: 'Review pricing strategy and reduce operational costs',
      autoAction: 'investigate'
    });
  }

  const overheadByShop: Record<string, { contributed: number; paid: number }> = {};
  shops.forEach((shop: any) => { overheadByShop[shop.id] = { contributed: 0, paid: 0 }; });
  overheadContributions.forEach((o: any) => { if (o.shop_id) overheadByShop[o.shop_id].contributed += Number(o.amount || 0); });
  overheadPayments.forEach((o: any) => { if (o.shop_id) overheadByShop[o.shop_id].paid += Math.abs(Number(o.amount || 0)); });

  Object.entries(overheadByShop).forEach(([shopId, data]) => {
    const shopName = shops.find((s: any) => s.id === shopId)?.name || shopId;
    if (data.contributed > 0 && data.paid === 0 && data.contributed > 500) {
      flaggedContributions.push({ shop: shopName, amount: data.contributed, reason: 'No overhead payments recorded' });
      recommendations.push({
        id: `overhead-${shopId}`,
        type: 'expense',
        priority: 'medium',
        title: `${shopName} Overhead Imbalance`,
        description: `Contributed $${data.contributed.toFixed(2)} but no payments through operations`,
        potentialImpact: data.contributed,
        riskLevel: 'low',
        actionSteps: ['Verify direct payments', 'Route future payments through operations', 'Update contribution records']
      });
    }
  });

  const posOverheadExpenses = ledger.filter((l: any) => l.type === 'expense' && (l.category === 'Overhead' || String(l.description || '').toLowerCase().includes('rent')));
  const posTotalOverhead = posOverheadExpenses.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);

  if (posTotalOverhead > 0 && Math.abs(posTotalOverhead - totalContributed) > 100) {
    posOpsDiscrepancies.push({ description: `Overhead mismatch: POS $${posTotalOverhead.toFixed(2)} vs Ops $${totalContributed.toFixed(2)}`, amount: Math.abs(posTotalOverhead - totalContributed) });
    findings.push({
      id: 'overhead-mismatch',
      severity: Math.abs(posTotalOverhead - totalContributed) > 200 ? 'critical' : 'warning',
      category: 'POS-Ops Reconciliation',
      title: 'Overhead Double-Counting',
      description: `POS: $${posTotalOverhead.toFixed(2)} | Ops: $${totalContributed.toFixed(2)}`,
      amount: Math.abs(posTotalOverhead - totalContributed),
      recommendation: 'POS overhead = routing to ops. Do not double-count as separate expense.',
      autoAction: 'flag'
    });
  }

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const deadStock = inventory.filter((item: any) => {
    const hasRecentSales = sales.some((s: any) => s.item_id === item.id && new Date(s.date) >= sixtyDaysAgo);
    const daysInStock = Math.floor((now.getTime() - new Date(item.date_added).getTime()) / (1000 * 3600 * 24));
    return !hasRecentSales && daysInStock > 60 && Number(item.quantity || 0) > 0;
  });
  const deadStockValue = deadStock.reduce((sum: number, item: any) => sum + (Number(item.landed_cost || 0) * Number(item.quantity || 0)), 0);

  if (deadStockValue > 500) {
    findings.push({
      id: 'dead-stock',
      severity: deadStockValue > 2000 ? 'critical' : 'warning',
      category: 'Inventory Health',
      title: `${deadStock.length} Dead Stock Items: $${deadStockValue.toFixed(2)}`,
      description: `${deadStock.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)} units without sales in 60+ days`,
      amount: deadStockValue,
      recommendation: 'Launch clearance campaign or bundle with fast-moving items',
      autoAction: 'review'
    });
    recommendations.push({
      id: 'dead-stock-recovery',
      type: 'allocation',
      priority: deadStockValue > 2000 ? 'urgent' : 'high',
      title: `Recover $${deadStockValue.toFixed(2)} Dead Stock`,
      description: `${deadStock.length} items have been sitting for 60+ days`,
      potentialImpact: deadStockValue,
      riskLevel: 'low',
      actionSteps: ['Price at 30% discount', 'Bundle with high-margin items', 'Consider liquidation partner'],
      roiEstimate: 0.2
    });
    difficultQuestions.push({ question: `How do we recover $${deadStockValue.toFixed(2)} trapped in dead stock?`, context: `${deadStock.length} dead items identified`, severity: deadStockValue > 2000 ? 'high' : 'medium' });
  }

  const shopTotals: Record<string, number> = {};
  sales.forEach((s: any) => { const shopId = s.shop_id || 'unknown'; shopTotals[shopId] = (shopTotals[shopId] || 0) + Number(s.total_with_tax || 0); });
  const shopExpenses: Record<string, number> = {};
  ledger.filter((l: any) => l.type === 'expense' && l.shop_id).forEach((l: any) => { shopExpenses[l.shop_id] = (shopExpenses[l.shop_id] || 0) + Math.abs(Number(l.amount || 0)); });

  Object.keys(shopTotals).forEach(shopId => {
    const sales_total = shopTotals[shopId] || 0;
    const expenses_total = shopExpenses[shopId] || 0;
    const ratio = sales_total > 0 ? expenses_total / sales_total : 0;
    const shopName = shops.find((s: any) => s.id === shopId)?.name || shopId;
    if (ratio > 0.5 && sales_total > 0) {
      findings.push({ id: `high-ratio-${shopId}`, severity: ratio > 0.8 ? 'critical' : 'warning', category: 'Shop Efficiency', title: `${shopName}: ${(ratio * 100).toFixed(1)}% Expense Ratio`, description: `$${expenses_total.toFixed(2)} expenses / $${sales_total.toFixed(2)} sales`, recommendation: 'Cut costs or increase prices', autoAction: 'investigate' });
      difficultQuestions.push({ question: `Is ${shopName} profitable at $${expenses_total.toFixed(2)} expenses?`, context: `Ratio: ${(ratio * 100).toFixed(1)}%`, severity: ratio > 0.8 ? 'high' : 'medium' });
    }
  });

  const avgDailySales = totalSales / Math.max(1, daysBack);
  const cashBurnRate = totalExpenses / Math.max(1, daysBack);
  const runway = cashBurnRate > 0 ? actualVault / cashBurnRate : 999;

  if (runway < 30 && actualVault > 0) {
    recommendations.push({
      id: 'cash-runway',
      type: 'savings',
      priority: 'urgent',
      title: `Cash Runway: ${Math.floor(runway)} days`,
      description: `At current burn rate of $${cashBurnRate.toFixed(2)}/day, vault lasts ${Math.floor(runway)} days`,
      potentialImpact: actualVault,
      riskLevel: 'high',
      actionSteps: ['Reduce discretionary spending', 'Accelerate collections', 'Review pricing', 'Consider investment injection']
    });
    difficultQuestions.push({ question: `Only ${Math.floor(runway)} days of runway remaining. What is the plan?`, context: `Burn rate: $${cashBurnRate.toFixed(2)}/day`, severity: 'high' });
  }

  const salesByDay: Record<string, number> = {};
  historicalSales.forEach((s: any) => {
    const day = toLocalDateString(s.date);
    salesByDay[day] = (salesByDay[day] || 0) + Number(s.total_with_tax || 0);
  });
  const dailySales = Object.values(salesByDay).sort((a, b) => b - a);
  const avgDailyHistorical = dailySales.length > 0 ? dailySales.reduce((a, b) => a + b, 0) / dailySales.length : 0;
  const trend = dailySales.length > 7 ? (dailySales.slice(0, Math.floor(dailySales.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(dailySales.length / 2) > dailySales.slice(Math.floor(dailySales.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(dailySales.length / 2) ? 'improving' : 'declining') : 'stable';

  learningInsights.push({
    pattern: 'Daily Sales Pattern',
    confidence: Math.min(0.95, dailySales.length / 30),
    historicalData: avgDailyHistorical,
    trend,
    prediction: trend === 'improving' ? 'Sales trending upward based on historical data' : trend === 'declining' ? 'Sales trending downward - review strategy' : 'Sales are stable'
  });

  if (avgDailySales > avgDailyHistorical * 1.1) {
    recommendations.push({
      id: 'growth-momentum',
      type: 'growth',
      priority: 'high',
      title: 'Growth Momentum Detected',
      description: `Current avg $${avgDailySales.toFixed(2)}/day vs historical $${avgDailyHistorical.toFixed(2)}/day`,
      potentialImpact: (avgDailySales - avgDailyHistorical) * 30,
      riskLevel: 'low',
      actionSteps: ['Maintain current trajectory', 'Increase stock levels', 'Consider marketing push', 'Hire additional staff if needed'],
      roiEstimate: 0.3
    });
  }

  const highValueExpenses = ledger.filter((l: any) => l.type === 'expense' && Math.abs(Number(l.amount || 0)) > 300);
  if (highValueExpenses.length > 3) {
    recommendations.push({
      id: 'expense-audit',
      type: 'savings',
      priority: 'medium',
      title: 'High-Value Expense Audit Needed',
      description: `${highValueExpenses.length} expenses over $300 detected`,
      potentialImpact: highValueExpenses.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0) * 0.1,
      riskLevel: 'medium',
      actionSteps: ['Review each high-value expense', 'Verify vendor relationships', 'Negotiate bulk discounts', 'Consider alternatives']
    });
  }

  const perfumeDeposits = opsLedger.filter((o: any) => o.kind === 'overhead_contribution' && String(o.title || '').toLowerCase().includes('perfume'));
  if (perfumeDeposits.length > 0) {
    const perfumeTotal = perfumeDeposits.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0);
    taxOptimizations.push({
      opportunity: 'Perfume/Investment Capital Growth',
      estimatedSavings: 0,
      complianceRisk: 'low',
      action: `$${perfumeTotal.toFixed(2)} in perfume investments tracked. Ensure proper documentation for tax purposes.`
    });
  }

  const taxComplianceItems = ledger.filter((l: any) => l.type === 'expense' && String(l.category || '').toLowerCase().includes('tithe'));
  if (taxComplianceItems.length > 0) {
    const titheTotal = taxComplianceItems.reduce((sum: number, l: any) => sum + Math.abs(Number(l.amount || 0)), 0);
    taxOptimizations.push({
      opportunity: 'Tithe/Charitable Contributions',
      estimatedSavings: titheTotal * 0.25,
      complianceRisk: 'medium',
      action: `$${titheTotal.toFixed(2)} in tithes recorded. Verify if deductible under local tax law.`
    });
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAvg = totalSales / daysInMonth;
  const cashFlowForecast = Array.from({ length: 14 }, (_, i) => {
    const dayOfMonth = now.getDate() + i + 1;
    const predictedDay = dayOfMonth > daysInMonth ? dayOfMonth - daysInMonth : dayOfMonth;
    const basePrediction = dailyAvg * (1 + (Math.sin(i / 2) * 0.2));
    return { day: predictedDay, predicted: Math.round(basePrediction * 100) / 100, confidence: Math.max(0.5, 0.9 - (i * 0.03)) };
  });

  const firstHalfSales = sales.slice(0, Math.floor(sales.length / 2)).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const secondHalfSales = sales.slice(Math.floor(sales.length / 2)).reduce((sum: number, s: any) => sum + Number(s.total_with_tax || 0), 0);
  const historicalAvgExpenses = totalExpenses * 0.9;
  const benchmarkComparison = [
    { metric: 'Sales Velocity', current: avgDailySales, historical: avgDailyHistorical, change: avgDailyHistorical > 0 ? ((avgDailySales - avgDailyHistorical) / avgDailyHistorical) * 100 : 0 },
    { metric: 'Expense Ratio', current: totalSales > 0 ? (totalExpenses / totalSales) * 100 : 0, historical: 50, change: 0 },
    { metric: 'Profit Margin', current: totalSales > 0 ? ((totalSales - totalExpenses) / totalSales) * 100 : 0, historical: 15, change: 0 },
    { metric: 'Ops Contribution', current: opsIncome, historical: opsIncome * 0.9, change: 10 }
  ];

  const liquidity = Math.min(100, (actualVault / Math.max(1, totalExpenses * 0.3)) * 100);
  const profitability = Math.max(0, Math.min(100, profitMargin * 5));
  const efficiency = Math.max(0, Math.min(100, 100 - (deadStockValue / Math.max(1, totalSales) * 100)));
  const growth = trend === 'improving' ? 80 : trend === 'declining' ? 30 : 50;
  const taxCompliance = taxOptimizations.filter(t => t.complianceRisk === 'high').length === 0 ? 85 : 60;
  const overall = Math.round((liquidity + profitability + efficiency + growth + taxCompliance) / 5);

  const healthScore: FinancialHealthScore = {
    overall,
    liquidity: Math.round(liquidity),
    profitability: Math.round(profitability),
    efficiency: Math.round(efficiency),
    growth: Math.round(growth),
    taxCompliance: Math.round(taxCompliance),
    breakdown: [
      { metric: 'Liquidity', score: Math.round(liquidity), status: liquidity > 70 ? 'excellent' : liquidity > 40 ? 'good' : liquidity > 20 ? 'warning' : 'critical', insight: `Vault covers ${Math.floor(runway)} days of operations` },
      { metric: 'Profitability', score: Math.round(profitability), status: profitMargin > 20 ? 'excellent' : profitMargin > 10 ? 'good' : profitMargin > 0 ? 'warning' : 'critical', insight: `${profitMargin.toFixed(1)}% profit margin on $${totalSales.toFixed(2)} sales` },
      { metric: 'Inventory Efficiency', score: Math.round(efficiency), status: deadStockValue < 500 ? 'excellent' : deadStockValue < 2000 ? 'good' : deadStockValue < 5000 ? 'warning' : 'critical', insight: `$${deadStockValue.toFixed(2)} trapped in ${deadStock.length} dead items` },
      { metric: 'Growth Trajectory', score: Math.round(growth), status: trend === 'improving' ? 'excellent' : trend === 'declining' ? 'warning' : 'good', insight: `Daily sales ${trend} over analysis period` },
      { metric: 'Tax Compliance', score: Math.round(taxCompliance), status: taxCompliance > 80 ? 'excellent' : taxCompliance > 60 ? 'good' : 'warning', insight: taxOptimizations.length > 0 ? `${taxOptimizations.length} optimization opportunities` : 'All clear' }
    ]
  };

  if (netFlow > 0 && runway > 60) {
    recommendations.push({
      id: 'surplus-deployment',
      type: 'investment',
      priority: 'medium',
      title: 'Surplus Cash Deployment Strategy',
      description: `$${actualVault.toFixed(2)} vault with ${Math.floor(runway)} days runway. Consider growth investments.`,
      potentialImpact: actualVault * 0.1,
      riskLevel: 'medium',
      actionSteps: ['Reinvest in inventory', 'Marketing budget increase', 'Staff training', 'Process automation']
    });
  }

  const missingMoney = vaultDrift + deadStockValue;
  if (missingMoney > 100) {
    difficultQuestions.push({ question: `TOTAL CAPITAL AT RISK: $${missingMoney.toFixed(2)}`, context: `Vault drift $${Math.abs(vaultDrift).toFixed(2)} + Dead stock $${deadStockValue.toFixed(2)}`, severity: 'high' });
  }

  const audit: MoneyAuditResult = {
    timestamp: now.toISOString(),
    period: { start: toLocalDateString(startDate), end: toLocalDateString(now) },
    summary: { totalSales, totalExpenses, totalOpsIncome: opsIncome, totalOpsExpenses: opsExpenses, netFlow, vaultDrift, missingMoney: missingMoney > 0 ? missingMoney : undefined },
    findings,
    posOpsCorrelation: { matched: Math.min(posTotalOverhead, totalContributed), unmatched: Math.abs(posTotalOverhead - totalContributed), discrepancies: posOpsDiscrepancies },
    deadStockAnalysis: { deadStockValue, daysInStock: 60, recoverySuggestions: deadStock.length > 0 ? [`Clearance: ${deadStock.slice(0, 3).map((i: any) => i.name).join(', ')}`, 'Bundle deals with fast movers', 'Liquidation partner inquiry'] : [] },
    overheadAnalysis: { contributed: totalContributed, paid: totalPaid, net: totalContributed - totalPaid, flaggedContributions },
    difficultQuestions
  };

  return { audit, healthScore, recommendations, learningInsights, taxOptimizations, cashFlowForecast, benchmarkComparison };
}

export async function analyzeRealExpenses(daysBack = 30): Promise<RealExpenseAnalysis> {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysBack);
  const periodStart = startDate.toISOString();
  const periodEnd = now.toISOString();

  const [ledgerData, opsLedgerData] = await Promise.all([
    supabaseAdmin.from('ledger_entries').select('*').eq('type', 'expense').gte('date', periodStart).lte('date', periodEnd),
    supabaseAdmin.from('operations_ledger').select('*').lt('amount', 0).gte('created_at', periodStart).lte('created_at', periodEnd),
  ]);

  const ledger = ledgerData.data || [];
  const opsLedger = opsLedgerData.data || [];

  const posExpenses = ledger.map((entry: any) => ({
    id: `pos-${entry.id}`,
    source: "POS",
    amount: Math.abs(Number(entry.amount || 0)),
    date: entry.date,
    title: entry.description || entry.category || "Expense",
    category: entry.category || "Expense",
    shop_id: entry.shop_id,
  }));

  const opsExpenses = opsLedger.map((entry: any) => ({
    id: `ops-${entry.id}`,
    source: "Operations",
    amount: Math.abs(Number(entry.amount || 0)),
    date: entry.created_at,
    title: entry.title || entry.kind || "Expense",
    category: entry.kind || "Expense",
    shop_id: entry.shop_id,
  }));

  const allExpenses = [...posExpenses, ...opsExpenses];

  let internalTransfers = 0;
  let personalExpenses = 0;
  let groceryExpenses = 0;
  let smallExpenses = 0;
  let overheadExpenses = 0;
  let miscExpenses = 0;
  const flaggedItems: RealExpenseAnalysis["flaggedItems"] = [];
  const insights: RealExpenseAnalysis["insights"] = [];

  const breakdown: Record<string, { total: number; count: number; avg: number }> = {};

  const expenseHistory: Record<string, number[]> = {};

  for (const expense of allExpenses) {
    const classification = classifyExpenseEntry(expense.title, expense.category, expense.amount);

    if (classification.isInternalTransfer) {
      internalTransfers += expense.amount;
      continue;
    }

    if (classification.isPersonal) {
      personalExpenses += expense.amount;
      continue;
    }

    if (!breakdown[classification.expenseType]) {
      breakdown[classification.expenseType] = { total: 0, count: 0, avg: 0 };
    }
    breakdown[classification.expenseType].total += expense.amount;
    breakdown[classification.expenseType].count += 1;

    switch (classification.expenseType) {
      case "groceries":
        groceryExpenses += expense.amount;
        break;
      case "small":
        smallExpenses += expense.amount;
        break;
      case "overhead":
        overheadExpenses += expense.amount;
        break;
      default:
        miscExpenses += expense.amount;
    }

    const categoryKey = expense.category || "other";
    if (!expenseHistory[categoryKey]) expenseHistory[categoryKey] = [];
    expenseHistory[categoryKey].push(expense.amount);

    if (expense.amount > 500) {
      flaggedItems.push({
        id: expense.id,
        source: expense.source,
        amount: expense.amount,
        title: expense.title,
        category: expense.category,
        flagReason: "High value expense over $500",
        flagType: "unusual",
      });
    }
  }

  Object.keys(breakdown).forEach(key => {
    const data = breakdown[key];
    data.avg = data.count > 0 ? data.total / data.count : 0;
  });

  Object.entries(expenseHistory).forEach(([category, amounts]) => {
    if (amounts.length >= 3) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const max = Math.max(...amounts);
      if (max > avg * 2.5) {
        const highExpense = allExpenses.find(e => e.category === category && e.amount === max);
        if (highExpense) {
          flaggedItems.push({
            id: highExpense.id,
            source: highExpense.source,
            amount: highExpense.amount,
            title: highExpense.title,
            category: highExpense.category,
            flagReason: `Abnormal: ${max.toFixed(2)} is ${(max / avg).toFixed(1)}x the ${category} average`,
            flagType: "abnormal",
          });
        }
      }
    }
  });

  if (smallExpenses > 0) {
    insights.push({
      type: "info",
      message: `Small/misc expenses total $${smallExpenses.toFixed(2)} - monitor for patterns`,
    });
  }

  if (groceryExpenses > 0) {
    insights.push({
      type: "tip",
      message: `Grocery expenses of $${groceryExpenses.toFixed(2)} detected - are these truly business expenses?`,
    });
  }

  const totalRealExpenses = groceryExpenses + smallExpenses + overheadExpenses + miscExpenses;

  if (totalRealExpenses > 0) {
    insights.push({
      type: "info",
      message: `Real business expenses: $${totalRealExpenses.toFixed(2)} (excludes $${internalTransfers.toFixed(2)} internal transfers)`,
    });
  }

  return {
    totalRealExpenses,
    internalTransfers,
    personalExpenses,
    groceryExpenses,
    smallExpenses,
    overheadExpenses,
    miscExpenses,
    expenseBreakdown: breakdown,
    flaggedItems: flaggedItems.slice(0, 10),
    insights,
  };
}
