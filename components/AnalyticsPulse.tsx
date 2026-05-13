import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui";
import { AlertTriangle, BarChart3, Boxes, PieChart, Sparkles } from "lucide-react";
import { AnalyticsResult, getAnalyticsFreshness } from "@/lib/analytics-results";

type AnalyticsPulseProps = {
  results: Record<string, AnalyticsResult | null>;
};

function money(value: unknown) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function firstForecast(result: AnalyticsResult | null) {
  const forecasts = result?.payload?.forecasts;
  if (!Array.isArray(forecasts) || forecasts.length === 0) return null;
  return forecasts
    .map((shop: any) => ({
      shopId: shop.shop_id || "unknown",
      next: Array.isArray(shop.forecast) ? Number(shop.forecast[0]?.predicted_sales || 0) : 0,
    }))
    .sort((a, b) => b.next - a.next)[0];
}

function topAnomaly(result: AnalyticsResult | null) {
  const anomalies = result?.payload?.anomalies;
  return Array.isArray(anomalies) && anomalies.length > 0 ? anomalies[0] : null;
}

function topInventoryRisk(result: AnalyticsResult | null) {
  const items = result?.payload?.priority_items;
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}

function capitalSummary(result: AnalyticsResult | null) {
  const payload = result?.payload;
  if (!payload) return null;
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  return {
    total: Number(payload.total_capital || 0),
    backend: payload.backend || "optimizer",
    top: recommendations[0] || null,
  };
}

export function AnalyticsPulse({ results }: AnalyticsPulseProps) {
  const demand = results.demand_forecast || null;
  const expenses = results.expense_anomaly || null;
  const inventory = results.inventory_velocity || null;
  const capital = results.capital_allocation || null;
  const forecast = firstForecast(demand);
  const anomaly = topAnomaly(expenses);
  const riskItem = topInventoryRisk(inventory);
  const allocation = capitalSummary(capital);

  return (
    <Card className="border-sky-500/20 bg-slate-950/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-black uppercase italic">
          <Sparkles className="h-5 w-5 text-sky-400" />
          Analytics Pulse
        </CardTitle>
        <CardDescription>Latest Python sidecar snapshots. Read-only, production-safe intelligence.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">Demand Forecast</p>
              <BarChart3 className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {forecast ? money(forecast.next) : "No data"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {forecast ? `${forecast.shopId} next-day projection` : "Run demand_forecast with --save-db"}
            </p>
            <Badge className="mt-3 bg-sky-500/10 text-sky-300 border-sky-500/20 text-[9px] uppercase">
              {getAnalyticsFreshness(demand)}
            </Badge>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Expense Anomaly</p>
              <AlertTriangle className="h-4 w-4 text-amber-300" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {anomaly ? money(anomaly.amount) : "No flags"}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate" title={anomaly?.label || ""}>
              {anomaly ? anomaly.label || anomaly.category || "Unusual outflow" : "No anomaly snapshot yet"}
            </p>
            <Badge className="mt-3 bg-amber-500/10 text-amber-300 border-amber-500/20 text-[9px] uppercase">
              {getAnalyticsFreshness(expenses)}
            </Badge>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Inventory Velocity</p>
              <Boxes className="h-4 w-4 text-emerald-300" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {riskItem ? money(riskItem.capital_tied) : "No risk"}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate" title={riskItem?.item_name || ""}>
              {riskItem ? `${riskItem.item_name} - ${riskItem.status}` : "No inventory snapshot yet"}
            </p>
            <Badge className="mt-3 bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px] uppercase">
              {getAnalyticsFreshness(inventory)}
            </Badge>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Capital Allocation</p>
              <PieChart className="h-4 w-4 text-violet-300" />
            </div>
            <p className="mt-3 text-2xl font-black text-white">
              {allocation ? money(allocation.total) : "No plan"}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {allocation?.top ? `${allocation.top.action} ${allocation.top.bucket}` : "Run Capital from analytics"}
            </p>
            <Badge className="mt-3 bg-violet-500/10 text-violet-300 border-violet-500/20 text-[9px] uppercase">
              {allocation ? `${allocation.backend} - ${getAnalyticsFreshness(capital)}` : getAnalyticsFreshness(capital)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
