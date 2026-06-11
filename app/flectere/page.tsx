export const dynamic = "force-dynamic";

import { getDashboardData, getFinancials } from "@/app/actions";
import {
  getSalesHistory,
  getBestSellers,
  getRevenueForecast,
  getPerformanceTrends,
  getSalesVsOverheadsData,
  getDeadStock,
  getReorderSuggestions,
  getPremiumStockValue,
  getBreakEvenStockValue,
  getLeanStockValue,
  getRevenueExpenseProfitTrajectoryData,
} from "@/lib/analytics";
import {
  getCashFlowProjection,
  getPaymentMethodAnalysis,
  getInventoryCategoryBreakdown,
  getShopComparison,
  getInventoryTurnover,
  getGrossMarginSummary,
} from "@/lib/flectere/data";
import { FlectereDashboard } from "./FlectereDashboard";

export default async function FlecterePage() {
  const [
    db,
    financials,
    salesHistory,
    bestSellers,
    forecast,
    trends,
    overheads,
    deadStock,
    reorderSuggestions,
    premiumValue,
    breakEvenValue,
    leanValue,
    cashFlow,
    paymentMethods,
    categoryBreakdown,
    shopComparison,
    inventoryTurnover,
    grossMargin,
    trajectory,
  ] = await Promise.all([
    getDashboardData(60),
    getFinancials(),
    getSalesHistory(60),
    getBestSellers(30),
    getRevenueForecast(),
    getPerformanceTrends(),
    getSalesVsOverheadsData(),
    getDeadStock(),
    getReorderSuggestions(),
    getPremiumStockValue(),
    getBreakEvenStockValue(),
    getLeanStockValue(),
    getCashFlowProjection(),
    getPaymentMethodAnalysis(90),
    getInventoryCategoryBreakdown(),
    getShopComparison(60),
    getInventoryTurnover(),
    getGrossMarginSummary(),
    getRevenueExpenseProfitTrajectoryData(),
  ]);

  const sales = db.sales || [];
  const inventory = db.inventory || [];
  const employees = db.employees || [];

  const totalInventoryValue = inventory.reduce((s: number, i: any) => s + (Number(i.landedCost || 0) * Number(i.quantity || 0)), 0);

  // Get true all-time revenue from paginated financials (bypasses 1k row limit)
  const allTimeRevenue = (financials.sales || []).reduce((s: number, r: any) => s + Number(r.total_with_tax || 0), 0);

  return (
    <div className="space-y-8 pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Flectere
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            High-level business intelligence — trends, forecasts, and deep analysis across all Nirvana entities.
          </p>
        </div>
      </div>

      <FlectereDashboard
        allTimeRevenue={allTimeRevenue}
        totalInventoryValue={totalInventoryValue}
        employeeCount={employees.length}
        salesHistory={salesHistory}
        bestSellers={bestSellers}
        forecast={forecast}
        trends={trends}
        overheads={overheads}
        deadStock={deadStock}
        reorderSuggestions={reorderSuggestions}
        premiumValue={premiumValue}
        breakEvenValue={breakEvenValue}
        leanValue={leanValue}
        financials={financials}
        salesCount={sales.length}
        cashFlow={cashFlow}
        paymentMethods={paymentMethods}
        categoryBreakdown={categoryBreakdown}
        shopComparison={shopComparison}
        inventoryTurnover={inventoryTurnover}
        grossMargin={grossMargin}
        trajectory={trajectory}
      />
    </div>
  );
}
