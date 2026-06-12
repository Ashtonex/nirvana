"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  AlertTriangle, Brain, Target, BarChart3, Users, Zap,
  ArrowUpRight, ArrowDownRight, Store, ShoppingCart, Clock,
  RefreshCw, Plus, Trash2, ExternalLink, Settings2, Check, X,
  Sparkles, Radio, Download, Mail, FileSpreadsheet, PieChart as PieIcon,
  RotateCw, Search, Eye, CreditCard, Building2, TrendingUp as TrendUpIcon,
  Activity, Layers, Crosshair, Box, Truck,
} from "lucide-react";
import type { SalesMetric, ReorderSuggestion, DeadStockItem, DailySalesMetric, Forecast } from "@/lib/analytics";
import type { ApiConnectorConfig, ConnectorMetric, AiInsight } from "@/lib/flectere/types";
import type {
  CashFlowDay, PaymentMethodSummary, CategorySummary,
  ShopComparison, InventoryTurnover, WoWComparison, DataQualityReport,
} from "@/lib/flectere/data";
import type { ShipmentSummary, ShipmentFullData } from "@/lib/flectere/shipments";
import { generateAiInsights } from "@/lib/flectere/ai-analysis";
import {
  loadConnectors, saveConnectors, getDefaultConnectors,
} from "@/lib/flectere/api-connectors";
import { exportCsv, generatePdf, sendEmailReport } from "@/lib/flectere/reporting";


const CHART_COLORS = ["#10b981", "#38bdf8", "#f97316", "#a78bfa", "#f43f5e", "#eab308", "#14b8a6", "#8b5cf6"];
const PAYMENT_COLORS: Record<string, string> = {
  Cash: "#10b981", Card: "#38bdf8", Mobile: "#a78bfa", Transfer: "#f97316", Credit: "#f43f5e",
};

interface FlectereDashboardProps {
  allTimeRevenue: number;
  totalInventoryValue: number;
  employeeCount: number;
  salesCount: number;
  salesHistory: DailySalesMetric[];
  bestSellers: SalesMetric[];
  forecast: Forecast;
  trends: { currentPeriodRevenue: number; previousPeriodRevenue: number; growth: number };
  overheads: Record<string, any[]>;
  deadStock: DeadStockItem[];
  reorderSuggestions: ReorderSuggestion[];
  premiumValue: number;
  breakEvenValue: number;
  leanValue: number;
  financials: any;
  cashFlow: { daily: CashFlowDay[]; totalRevenue: number; totalExpenses: number; netProjected: number; runway: number; hasData: boolean; daysWithData: number };
  paymentMethods: PaymentMethodSummary[];
  categoryBreakdown: CategorySummary[];
  shopComparison: ShopComparison[];
  inventoryTurnover: InventoryTurnover;
  grossMargin: { totalRevenue: number; totalCost: number; grossProfit: number; marginPct: number };
  trajectory: Record<string, any[]>;
  wow: WoWComparison;
  dataQuality: DataQualityReport;
  shipments: ShipmentSummary[];
}

const SHOP_OPTIONS = [
  { id: "kipasa", label: "Kipasa" },
  { id: "dubdub", label: "Dub Dub" },
  { id: "tradecenter", label: "Trade Center" },
  { id: "tshirts", label: "Nirvana Tees" },
];

export function FlectereDashboard(props: FlectereDashboardProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedShops, setSelectedShops] = useState<string[]>(["kipasa", "dubdub", "tradecenter"]);
  const [insights, setInsights] = useState<AiInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [connectors, setConnectors] = useState<ApiConnectorConfig[]>([]);
  const [connectorMetrics, setConnectorMetrics] = useState<ConnectorMetric[]>([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [showConnectorConfig, setShowConnectorConfig] = useState(false);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [drillDown, setDrillDown] = useState<{ open: boolean; date?: string; data?: DailySalesMetric }>({ open: false });
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [pythonRunning, setPythonRunning] = useState(false);
  const [pythonResult, setPythonResult] = useState<string | null>(null);
  const [pythonKind, setPythonKind] = useState<string>("inventory_velocity");
  const [showPythonModal, setShowPythonModal] = useState(false);
  const [allPythonResults, setAllPythonResults] = useState<Record<string, any>>({});
  const [activePythonTab, setActivePythonTab] = useState<string>("inventory_velocity");
  const [activeTab, setActiveTab] = useState("overview");
  const [shipmentModal, setShipmentModal] = useState<{ open: boolean; shipmentId: string; data: ShipmentFullData | null; loading: boolean }>({ open: false, shipmentId: "", data: null, loading: false });
  const chartRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setConnectors(loadConnectors()); }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => window.location.reload(), 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  const {
    allTimeRevenue, totalInventoryValue, employeeCount, salesCount,
    salesHistory, bestSellers, forecast, trends, overheads,
    deadStock, reorderSuggestions, premiumValue, breakEvenValue, leanValue,
    cashFlow, paymentMethods, categoryBreakdown, shopComparison, inventoryTurnover, grossMargin, trajectory, wow, dataQuality, shipments,
  } = props;

  const avgDailyRevenue = salesHistory.length > 0
    ? salesHistory.reduce((s, d) => s + d.revenue, 0) / salesHistory.length : 0;
  const projectedMonthly = avgDailyRevenue * 30;
  const deadStockValue = deadStock.reduce((s, d) => s + d.value, 0);
  const mid = Math.floor(salesHistory.length / 2);
  const firstHalf = salesHistory.slice(0, mid);
  const secondHalf = salesHistory.slice(mid);
  const firstHalfRev = firstHalf.reduce((s, d) => s + d.revenue, 0);
  const secondHalfRev = secondHalf.reduce((s, d) => s + d.revenue, 0);
  const benchmarkGrowth = firstHalfRev > 0 ? ((secondHalfRev - firstHalfRev) / firstHalfRev) * 100 : 0;

  const bestSellersData = useMemo(() => {
    return bestSellers.slice(0, 8).map((item, i) => ({
      rank: i + 1,
      name: item.itemName.length > 28 ? item.itemName.slice(0, 28) + "..." : item.itemName,
      qty: item.totalQuantity, revenue: item.totalRevenue,
      margin: Number(item.grossMargin.toFixed(1)),
    }));
  }, [bestSellers]);

  const runAiAnalysis = useCallback(async () => {
    setInsightsLoading(true);
    setInsights([]);
    try {
      const result = await generateAiInsights({
        allTimeRevenue, salesCount, employeeCount, totalInventoryValue,
        avgDailyRevenue, growthPct: trends.growth,
        currentRevenue: trends.currentPeriodRevenue,
        previousRevenue: trends.previousPeriodRevenue,
        deadStockCount: deadStock.length, deadStockValue,
        deadStockDetails: deadStock.map(d => ({
          name: d.itemName, qty: d.quantity, value: d.value, days: d.daysInStock,
        })),
        reorderCount: reorderSuggestions.length,
        reorderDetails: reorderSuggestions.map(r => ({
          name: r.itemName, stock: r.currentStock, daysToZero: r.daysToZero, suggested: r.suggestedReorder,
        })),
        premiumValue, breakEvenValue, leanValue,
        bestSellers: bestSellersData,
        forecastTrend: forecast.trend, forecastProjected: forecast.projectedNext30,
        forecastConfidence: forecast.confidence, shopCount: SHOP_OPTIONS.length,
      });
      setInsights(result);
    } catch { setInsights([]); } finally { setInsightsLoading(false); }
  }, [allTimeRevenue, salesCount, employeeCount, totalInventoryValue, avgDailyRevenue, trends, deadStock, deadStockValue, reorderSuggestions, premiumValue, breakEvenValue, leanValue, bestSellersData, forecast]);

  const refreshConnectors = useCallback(async () => {
    const enabled = connectors.filter((c) => c.enabled && c.baseUrl);
    if (enabled.length === 0) { setConnectorError("No enabled connectors with a base URL. Configure one below."); return; }
    setConnectorsLoading(true);
    setConnectorError(null);
    try {
      const res = await fetch("/api/flectere/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectors }) });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setConnectorMetrics(data.metrics || []);
      if (data.connectors) { setConnectors(data.connectors); saveConnectors(data.connectors); }
    } catch (err: any) { setConnectorError(err.message || "Failed to fetch connectors"); } finally { setConnectorsLoading(false); }
  }, [connectors]);

  const addDefaultConnectors = useCallback(() => {
    const defaults = getDefaultConnectors().map((c) => ({ ...c, enabled: true }));
    setConnectors((prev) => [...prev, ...defaults]);
    saveConnectors([...connectors, ...defaults]);
  }, [connectors]);

  const updateConnector = useCallback((id: string, patch: Partial<ApiConnectorConfig>) => {
    setConnectors((prev) => { const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c)); saveConnectors(next); return next; });
  }, []);

  const removeConnector = useCallback((id: string) => {
    setConnectors((prev) => { const next = prev.filter((c) => c.id !== id); saveConnectors(next); return next; });
  }, []);

  const handleExportPdf = useCallback(async () => {
    const sections: any[] = [
      { heading: "Nirvana Flectere — Full Intelligence Report", body: `Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}` },
      { heading: "Executive Summary", body: `All-Time Revenue: $${allTimeRevenue.toLocaleString()} across ${salesCount} transactions | Inventory Value: $${totalInventoryValue.toLocaleString()} | Growth (30d): ${trends.growth.toFixed(1)}% | Employees: ${employeeCount} across ${SHOP_OPTIONS.length} shops` },
      { heading: "Daily Revenue (60d)", body: `Avg Daily: $${Math.round(avgDailyRevenue).toLocaleString()} | Projected Monthly: $${Math.round(projectedMonthly).toLocaleString()} | Week-over-Week: ${wow.growth >= 0 ? "+" : ""}${wow.growth.toFixed(1)}%`, table: { headers: ["Date", "Revenue", "Profit"], rows: salesHistory.map((d) => [`${d.date}`, `$${d.revenue.toLocaleString()}`, `$${d.profit.toLocaleString()}`]) } },
      { heading: "Forecast", body: `Trend: ${forecast.trend} | Projected Next 30d: $${Math.round(forecast.projectedNext30).toLocaleString()} | Confidence: ${(forecast.confidence * 100).toFixed(0)}% | Slope: $${forecast.slope.toFixed(2)}/day` },
    ];
    if (bestSellersData.length > 0) {
      sections.push({ heading: "Best Sellers (30d)", body: "", table: { headers: ["#", "Item", "Units", "Revenue", "Margin"], rows: bestSellersData.map((b) => [`${b.rank}`, b.name, `${b.qty}`, `$${b.revenue.toLocaleString()}`, `${b.margin}%`]) } });
    }
    sections.push({ heading: "Gross Margin & Turnover", body: `Gross Margin: ${grossMargin.marginPct}% ($${grossMargin.grossProfit.toLocaleString()} profit) | Inventory Turnover: ${inventoryTurnover.overall}x annualized | Cash Runway: ${cashFlow.runway >= 999 ? "∞" : `${cashFlow.runway.toFixed(1)} months`}` });
    if (paymentMethods.length > 0) {
      sections.push({ heading: "Payment Methods (90d)", body: "", table: { headers: ["Method", "Total", "Transactions", "%"], rows: paymentMethods.map((p) => [p.method, `$${p.total.toLocaleString()}`, String(p.count), `${p.percentage}%`]) } });
    }
    if (categoryBreakdown.length > 0) {
      sections.push({ heading: "Inventory by Category", body: "", table: { headers: ["Category", "Units", "Cost Value"], rows: categoryBreakdown.slice(0, 8).map((c) => [c.category, String(c.unitCount), `$${Math.round(c.totalCost).toLocaleString()}`]) } });
    }
    if (deadStock.length > 0) {
      sections.push({ heading: "Dead Stock (60d+ no sale)", body: `${deadStock.length} items worth $${Math.round(deadStockValue).toLocaleString()}`, table: { headers: ["Item", "Units", "Value", "Days"], rows: deadStock.slice(0, 10).map((d) => [d.itemName, String(d.quantity), `$${Math.round(d.value).toLocaleString()}`, String(d.daysInStock)]) } });
    }
    if (reorderSuggestions.length > 0) {
      sections.push({ heading: "Reorder Suggestions", body: "", table: { headers: ["Item", "Stock Left", "Days to Zero", "Reorder Qty"], rows: reorderSuggestions.slice(0, 10).map((r) => [r.itemName, String(r.currentStock), String(r.daysToZero), String(r.suggestedReorder)]) } });
    }
    if (shopComparison.length > 0) {
      sections.push({ heading: "Shop Comparison (60d)", body: "", table: { headers: ["Shop", "Revenue", "Sales", "Avg Ticket", "Top Item"], rows: shopComparison.map((s) => [s.shopName, `$${s.revenue.toLocaleString()}`, String(s.salesCount), `$${s.averageTicket.toLocaleString()}`, `${s.topItem} (${s.topItemQty})`]) } });
    }
    if (inventoryTurnover.byCategory.length > 0) {
      sections.push({ heading: "Inventory Turnover by Category", body: "", table: { headers: ["Category", "Turnover", "Days to Turn"], rows: inventoryTurnover.byCategory.map((c) => [c.category, `${c.turnover}x`, String(c.daysToTurn)]) } });
    }
    sections.push({ heading: "Period Benchmarking", body: `First half: $${Math.round(firstHalfRev).toLocaleString()} | Second half: $${Math.round(secondHalfRev).toLocaleString()} | Change: ${benchmarkGrowth >= 0 ? "+" : ""}${benchmarkGrowth.toFixed(1)}%` });
    sections.push({ heading: "Data Quality", body: `Sales records: ${dataQuality.totalSales} | Inventory items: ${dataQuality.totalInventory} | Employees: ${dataQuality.totalEmployees} | Shops: ${dataQuality.totalShops} | Last sale: ${dataQuality.lastSaleDate ? new Date(dataQuality.lastSaleDate).toLocaleDateString() : "N/A"}` });

    const engineNames: Record<string, string> = {
      inventory_velocity: "Inventory Velocity", demand_forecast: "Demand Forecast",
      expense_anomaly: "Expense Anomaly", capital_allocation: "Capital Allocation", operations_overview: "Operations Overview",
    };
    for (const [kind, result] of Object.entries(allPythonResults)) {
      if (result?.ok && result?.payload) {
        sections.push({
          heading: `ML: ${engineNames[kind] || kind}`,
          body: result.summary || "",
          payload: result.payload,
        });
      }
    }

    const chartEl = chartRef.current;
    const chartCanvas = chartEl ? await import("html2canvas").then((h2c) => h2c.default(chartEl, { backgroundColor: "#0f172a", scale: 2 }).then((c) => c.toDataURL("image/png")).catch(() => null)).catch(() => null) : null;
    await generatePdf("Flectere_Full_Report", sections, chartCanvas ? [{ img: chartCanvas, heading: "Revenue Chart (60d)" }] : []);
  }, [allTimeRevenue, totalInventoryValue, trends, employeeCount, avgDailyRevenue, projectedMonthly, salesHistory, forecast, bestSellersData, grossMargin, inventoryTurnover, cashFlow, paymentMethods, categoryBreakdown, deadStock, deadStockValue, reorderSuggestions, shopComparison, firstHalfRev, secondHalfRev, benchmarkGrowth, dataQuality, allPythonResults, wow]);

  const handleExportCsv = useCallback(() => {
    const headers = ["Date", "Revenue", "Profit"];
    const rows = salesHistory.map((d) => [d.date, String(d.revenue), String(d.profit)]);
    exportCsv(headers, rows, `flectere_revenue_${new Date().toISOString().slice(0, 10)}.csv`);
  }, [salesHistory]);

  const handleSendEmail = useCallback(async () => {
    if (!emailTo) return;
    setEmailSending(true);
    setEmailResult(null);
    const html = `
      <h1>Flectere Intelligence Report</h1>
      <p>All-Time Revenue: <strong>$${allTimeRevenue.toLocaleString()}</strong></p>
      <p>Growth: <strong>${trends.growth.toFixed(1)}%</strong></p>
      <p>Inventory Value: <strong>$${totalInventoryValue.toLocaleString()}</strong></p>
      <p>Avg Daily Revenue: <strong>$${Math.round(avgDailyRevenue).toLocaleString()}</strong></p>
      <p>Projected Monthly: <strong>$${Math.round(projectedMonthly).toLocaleString()}</strong></p>
      <p>Dead Stock: <strong>${deadStock.length} items ($${Math.round(deadStockValue).toLocaleString()})</strong></p>
      <hr />
      <p style="color: #888;">Generated by Nirvana Flectere · ${new Date().toLocaleString()}</p>
    `;
    const result = await sendEmailReport(emailTo, `Flectere Report — ${new Date().toLocaleDateString()}`, html);
    setEmailSending(false);
    if (result.success) { setEmailResult("Sent!"); setTimeout(() => { setEmailDialog(false); setEmailResult(null); }, 1500); }
    else setEmailResult(result.error || "Failed");
  }, [emailTo, allTimeRevenue, trends, totalInventoryValue, avgDailyRevenue, projectedMonthly, deadStock, deadStockValue]);

  const runPythonAnalytics = useCallback(async (kind: string) => {
    setPythonRunning(true);
    setPythonResult(null);
    setShowPythonModal(false);
    try {
      const res = await fetch("/api/analytics/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (kind === "all") {
        const results: Record<string, any> = {};
        (data.results || []).forEach((r: any) => {
          results[r.kind] = r;
        });
        setAllPythonResults(results);
        setActivePythonTab("inventory_velocity");
        setShowPythonModal(true);
        const okCount = (data.results || []).filter((r: any) => r.ok).length;
        const total = (data.results || []).length;
        setPythonResult(`${okCount}/${total} engines completed`);
      } else {
        const result = data.results?.[0];
        if (result?.ok) {
          setAllPythonResults((prev) => ({ ...prev, [kind]: result }));
          setActivePythonTab(kind);
          setShowPythonModal(true);
          setPythonResult(`${kind} — ${result.summary || "Done"}`);
        } else {
          setPythonResult(`${kind} — Error: ${result?.error || "Unknown"}`);
        }
      }
    } catch (err: any) {
      setPythonResult(`${kind} — ${err.message}`);
    } finally {
      setPythonRunning(false);
    }
  }, []);

  const openShipmentModal = useCallback(async (shipmentId: string) => {
    setShipmentModal({ open: true, shipmentId, data: null, loading: true });
    try {
      const res = await fetch(`/api/flectere/shipment-detail?shipmentId=${encodeURIComponent(shipmentId)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setShipmentModal((prev) => ({ ...prev, data: data.data, loading: false }));
    } catch {
      setShipmentModal((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  // Chart drill-down
  const handleChartClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload) {
      setDrillDown({ open: true, date: data.activePayload[0].payload.date, data: data.activePayload[0].payload });
    }
  }, []);

  const cashFlowData = cashFlow.daily.filter((d) => d.day % 2 === 0 || d.day === cashFlow.daily.length);

  if (!mounted) {
    return (
      <div className="space-y-8">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-slate-900/40 border-slate-800">
            <CardContent className="h-[200px] flex items-center justify-center">
              <p className="text-slate-500 text-sm">Loading intelligence...</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ===== FILTERS + ACTION BAR ===== */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Shops:</span>
            {SHOP_OPTIONS.map((shop) => (
              <button key={shop.id} onClick={() => setSelectedShops((prev) => prev.includes(shop.id) ? prev.filter((s) => s !== shop.id) : [...prev, shop.id])}
                className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${selectedShops.includes(shop.id) ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-slate-800 text-slate-500 border border-slate-700/50 hover:text-slate-300"}`}>
                {shop.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Actions:</span>
            <button onClick={handleExportPdf} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-wider hover:bg-rose-600/20 transition-all">
              <Download className="h-3 w-3" /> PDF
            </button>
            <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600/20 transition-all">
              <FileSpreadsheet className="h-3 w-3" /> CSV
            </button>
            <button onClick={() => setEmailDialog(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/10 border border-sky-500/20 text-sky-300 text-[10px] font-black uppercase tracking-wider hover:bg-sky-600/20 transition-all">
              <Mail className="h-3 w-3" /> Email
            </button>
            <button onClick={() => setAutoRefresh((r) => !r)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${autoRefresh ? "bg-orange-600/20 border-orange-500/30 text-orange-300" : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"}`}>
              <RotateCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Live 30s" : "Auto"}
            </button>
            <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-wider hover:text-slate-200 transition-all">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ===== EMAIL DIALOG ===== */}
      {emailDialog && (
        <Card className="bg-slate-900/60 border-sky-500/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <input className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono border border-slate-700 focus:border-sky-500 outline-none" placeholder="recipient@example.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              <button onClick={handleSendEmail} disabled={emailSending || !emailTo} className="px-4 py-2 rounded-lg bg-sky-600/20 border border-sky-500/30 text-sky-300 text-xs font-black uppercase tracking-wider hover:bg-sky-600/30 transition-all disabled:opacity-40">
                {emailSending ? "Sending..." : "Send Report"}
              </button>
              <button onClick={() => { setEmailDialog(false); setEmailResult(null); }} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-black uppercase tracking-wider hover:text-slate-200">Close</button>
              {emailResult && <span className={`text-xs font-bold ${emailResult === "Sent!" ? "text-emerald-400" : "text-rose-400"}`}>{emailResult}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== TAB BAR ===== */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-px">
        {[
          { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
          { id: "sales", label: "Sales & Products", icon: <ShoppingCart className="h-3.5 w-3.5" /> },
          { id: "inventory", label: "Inventory & Stock", icon: <Package className="h-3.5 w-3.5" /> },
          { id: "analytics", label: "ML Analytics", icon: <Brain className="h-3.5 w-3.5" /> },
          { id: "integrations", label: "Integrations", icon: <Radio className="h-3.5 w-3.5" /> },
          { id: "shipments", label: "Shipments", icon: <Truck className="h-3.5 w-3.5" /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-t text-[10px] font-black uppercase tracking-wider transition-all ${activeTab === tab.id
              ? "bg-slate-900/60 text-orange-400 border border-slate-700 border-b-transparent -mb-px"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW CONTENT ===== */}
      {activeTab === "overview" && (
        <>
          {/* ===== EXECUTIVE SUMMARY ===== */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={<DollarSign className="h-4 w-4 text-emerald-400" />} label="All-Time Revenue" value={`$${allTimeRevenue.toLocaleString()}`} sub={`${salesCount} transactions`} />
        <KpiCard icon={<Package className="h-4 w-4 text-sky-400" />} label="Inventory Value" value={`$${totalInventoryValue.toLocaleString()}`} sub={`Lean $${leanValue.toLocaleString()}`} />
        <KpiCard icon={<BarChart3 className="h-4 w-4 text-orange-400" />} label="Avg Daily Revenue (60d)" value={`$${Math.round(avgDailyRevenue).toLocaleString()}`} sub={`Proj. monthly $${Math.round(projectedMonthly).toLocaleString()}`} />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-rose-400" />} label="Growth (30d vs prev)" value={`${trends.growth >= 0 ? "+" : ""}${trends.growth.toFixed(1)}%`} sub={`$${trends.currentPeriodRevenue.toLocaleString()} vs $${trends.previousPeriodRevenue.toLocaleString()}`} note={trends.growth < 0 ? "Revenue decreased — check if any shop or category underperformed" : `${trends.growth > 10 ? "Strong growth vs prior period" : "Stable performance"}`} />
        <KpiCard icon={<Users className="h-4 w-4 text-violet-400" />} label="Workforce" value={String(employeeCount)} sub="employees across shops" />
      </div>

      {/* ===== GROSS MARGIN + INVENTORY TURNOVER + WoW + CASH FLOW MINI ===== */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<Activity className="h-4 w-4 text-emerald-400" />} label="Gross Margin (60d)" value={`${grossMargin.marginPct}%`} sub={`$${grossMargin.grossProfit.toLocaleString()} profit`} />
        <KpiCard icon={<Layers className="h-4 w-4 text-cyan-400" />} label="Inventory Turnover" value={`${inventoryTurnover.overall}x`} sub="Annualized rate" />
        <KpiCard icon={<TrendingUp className="h-4 w-4 text-indigo-400" />} label="Week-over-Week" value={`${wow.growth >= 0 ? "+" : ""}${wow.growth.toFixed(1)}%`} sub={`$${Math.round(wow.currentWeekRevenue).toLocaleString()} vs $${Math.round(wow.previousWeekRevenue).toLocaleString()}`} note={wow.growth < 0 ? "Down from last week — daily fluctuations are normal; look for trends over multiple weeks" : undefined} />
        <KpiCard icon={<DollarSign className="h-4 w-4 text-amber-400" />} label="Cash Runway" value={`${cashFlow.runway >= 999 ? "∞" : cashFlow.runway.toFixed(0) + " months"}`} sub={`Net projected: ${cashFlow.netProjected >= 0 ? "+" : ""}$${cashFlow.netProjected.toLocaleString()}`} note={cashFlow.runway === 0 ? "Expenses exceed revenue — review cost structure and pricing" : undefined} />
      </div>

      {/* ===== AI INSIGHTS ===== */}
      <Card className={`border ${insights.length > 0 ? "border-violet-500/30" : "border-slate-700/50"} bg-slate-900/40`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <Sparkles className={`h-4 w-4 ${insights.length > 0 ? "text-violet-400" : "text-slate-500"}`} /> AI Deep Analysis
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
                {insights.length > 0 ? `${insights.length} insights generated` : "Plain-English business intelligence powered by OpenAI"}
              </CardDescription>
            </div>
            <button onClick={runAiAnalysis} disabled={insightsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs font-black uppercase tracking-wider hover:bg-violet-600/30 transition-all disabled:opacity-40">
              {insightsLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              {insightsLoading ? "Analyzing..." : insights.length > 0 ? "Refresh Analysis" : "Run Analysis"}
            </button>
          </div>
        </CardHeader>
        {insights.length > 0 && (
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {insights.map((ins) => (
                <div key={ins.id} className={`p-3 rounded-lg border ${ins.severity === "critical" ? "bg-rose-500/5 border-rose-500/20" : ins.severity === "warning" ? "bg-amber-500/5 border-amber-500/20" : ins.severity === "positive" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-slate-800/30 border-slate-700/50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${ins.severity === "critical" ? "text-rose-400" : ins.severity === "warning" ? "text-amber-400" : ins.severity === "positive" ? "text-emerald-400" : "text-slate-400"}`}>
                      {ins.category} · {ins.severity}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white">{ins.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{ins.body}</p>
                  {ins.metric && <div className="mt-2 flex items-center gap-2 text-xs font-mono"><span className="text-slate-500">{ins.metric.label}:</span><span className="text-orange-400 font-black">{ins.metric.value}</span></div>}
                  {ins.action && <p className="mt-1.5 text-[10px] text-slate-500 italic">→ {ins.action}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ===== REVENUE TREND + FORECAST ===== */}
      <div ref={chartRef} className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-slate-900/40 border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Revenue Trend (60 days)
              <span className="text-[9px] text-slate-600 font-normal ml-1">click to drill down</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {salesHistory.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">No sales data</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={salesHistory} onClick={handleChartClick} style={{ cursor: "pointer" }}>
                  <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* FORECAST */}
          <Card className="bg-slate-900/40 border-sky-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <Brain className="h-4 w-4 text-sky-400" /> Revenue Forecast
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
                Linear regression · {forecast.confidence >= 0.7 ? "High" : forecast.confidence >= 0.4 ? "Medium" : "Low"} confidence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Projected Next 30d</p>
                  <p className="text-2xl font-black font-mono text-sky-400">${Math.round(forecast.projectedNext30).toLocaleString()}</p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-black uppercase ${forecast.trend === "up" ? "bg-emerald-500/10 text-emerald-400" : forecast.trend === "down" ? "bg-rose-500/10 text-rose-400" : "bg-slate-500/10 text-slate-400"}`}>
                  {forecast.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : forecast.trend === "down" ? <ArrowDownRight className="h-3 w-3" /> : null}
                  {forecast.trend}
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <p>Slope: ${forecast.slope.toFixed(2)}/day · Confidence: {(forecast.confidence * 100).toFixed(0)}%</p>
              </div>
              {forecast.trend === "down" && (
                <p className="text-[9px] text-slate-600 mt-1">The model projects declining revenue based on recent trends. This is a statistical estimate — review upcoming promotions, events, or seasonal patterns that could change the trajectory.</p>
              )}
              {forecast.nextMonthPoints.length > 0 && (
                <div className="h-[100px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={forecast.nextMonthPoints.filter((_, i) => i % 5 === 0)}>
                      <XAxis dataKey="day" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} hide />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                      <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* BENCHMARKING */}
          <Card className="bg-slate-900/40 border-indigo-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <TrendUpIcon className="h-4 w-4 text-indigo-400" /> Period Benchmarking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 rounded bg-slate-800/30">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">First Half (30d)</span>
                  <span className="text-sm font-mono text-white">${Math.round(firstHalfRev).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-800/30">
                  <span className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Second Half (30d)</span>
                  <span className="text-sm font-mono text-white">${Math.round(secondHalfRev).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-indigo-500/10 border border-indigo-500/20">
                  <span className="text-[10px] uppercase font-black text-indigo-400 tracking-widest">Δ Change</span>
                  <span className={`text-sm font-black font-mono ${benchmarkGrowth >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {benchmarkGrowth >= 0 ? "+" : ""}{benchmarkGrowth.toFixed(1)}%
                  </span>
                </div>
                {benchmarkGrowth < 0 && (
                  <p className="text-[9px] text-slate-600 mt-1">Revenue declined in the second half vs first half. This could signal seasonality, changing demand, or operational issues worth investigating.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== CASH FLOW PROJECTION ===== */}
      {cashFlowData.length > 0 && cashFlow.hasData && (
        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <DollarSign className="h-4 w-4 text-amber-400" /> Cash Flow Projection
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              Month-to-date revenue vs expenses · Runway: {cashFlow.runway >= 999 ? "∞" : `${cashFlow.runway.toFixed(1)} months`} · {cashFlow.daysWithData} days with data
            </CardDescription>
            {cashFlow.netProjected < 0 && (
              <p className="text-[9px] text-slate-600 mt-1">Expenses are outpacing revenue this month. Review discretionary spending and identify which cost categories are driving the overage.</p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-[9px]">
              <span className="inline-block w-2 h-0.5 rounded bg-emerald-400" />
              <span className="text-slate-500 uppercase tracking-wider font-black">Revenue (actual)</span>
              <span className="inline-block w-2 h-0.5 rounded bg-emerald-400 opacity-30 ml-2" />
              <span className="text-slate-600 uppercase tracking-wider font-black">Revenue (projected)</span>
              <span className="inline-block w-2 h-0.5 rounded bg-fuchsia-400 ml-2" />
              <span className="text-slate-500 uppercase tracking-wider font-black">Net Cash (projected)</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="cfRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="cfExp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.2} /><stop offset="100%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                  <linearGradient id="cfNet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.2} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                {/* Solid line for actual revenue area, dashed extension for projection */}
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#cfRev)" strokeWidth={2} dot={false} connectNulls />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f97316" fill="url(#cfExp)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="netCash" name="Net Cash" stroke="#a78bfa" fill="url(#cfNet)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ===== TRAJECTORY (Revenue / Expenses / Profit) ===== */}
      {trajectory?.global?.length > 0 && (
        <Card className="bg-slate-900/40 border-indigo-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Activity className="h-4 w-4 text-indigo-400" /> Revenue / Expense / Profit Trajectory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trajectory.global.filter((d: any) => d.revenue !== null && d.day % 2 === 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#a78bfa" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* ===== SALES & PRODUCTS TAB ===== */}
      {activeTab === "sales" && (
        <>

      {/* ===== BEST SELLERS + STOCK VALUES ===== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <ShoppingCart className="h-4 w-4 text-amber-400" /> Best Sellers (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bestSellersData.length === 0 ? (
              <p className="text-sm text-slate-500">No sales data for this period.</p>
            ) : (
              <div className="space-y-2">
                {bestSellersData.map((item) => (
                  <div key={item.rank} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] font-black text-slate-600 w-4 text-right">{item.rank}</span>
                      <span className="text-xs text-slate-300 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{item.qty} units</span>
                      <span className="text-xs font-mono text-emerald-400 w-20 text-right">${item.revenue.toLocaleString()}</span>
                      <span className={`text-[10px] font-black w-10 text-right ${item.margin >= 40 ? "text-emerald-400" : item.margin >= 20 ? "text-amber-400" : "text-rose-400"}`}>{item.margin}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-violet-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Target className="h-4 w-4 text-violet-400" /> Stock Value Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div><p className="text-[10px] uppercase font-black text-emerald-400 tracking-widest">Premium Value</p><p className="text-xs text-slate-500">Retail at 65% markup</p></div>
                <p className="text-xl font-black font-mono text-emerald-400">${Math.round(premiumValue).toLocaleString()}</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-sky-500/5 border border-sky-500/10">
                <div><p className="text-[10px] uppercase font-black text-sky-400 tracking-widest">Break-Even Value</p><p className="text-xs text-slate-500">Retail at 35% markup</p></div>
                <p className="text-xl font-black font-mono text-sky-400">${Math.round(breakEvenValue).toLocaleString()}</p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <div><p className="text-[10px] uppercase font-black text-orange-400 tracking-widest">Lean Value</p><p className="text-xs text-slate-500">Retail at 25% markup</p></div>
                <p className="text-xl font-black font-mono text-orange-400">${Math.round(leanValue).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== PAYMENT METHODS + CATEGORY BREAKDOWN ===== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/40 border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <CreditCard className="h-4 w-4 text-cyan-400" /> Payment Methods (90d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-slate-500">No payment data available.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paymentMethods} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {paymentMethods.map((entry, i) => (
                          <Cell key={entry.method} fill={PAYMENT_COLORS[entry.method] || CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {paymentMethods.map((pm) => (
                    <div key={pm.method} className="flex items-center justify-between p-2 rounded bg-slate-800/30">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[pm.method] || "#888" }} />
                        <span className="text-xs text-slate-300">{pm.method}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-white">${pm.total.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-500">{pm.count} txns · {pm.percentage}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Layers className="h-4 w-4 text-emerald-400" /> Inventory by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500">No inventory data.</p>
            ) : (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={categoryBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <YAxis type="category" dataKey="category" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                    <Bar dataKey="totalCost" name="Cost Value" fill="#10b981" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {categoryBreakdown.slice(0, 6).map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/30">
                      <span className="text-[10px] text-slate-300 uppercase tracking-wider">{cat.category}</span>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="text-slate-500">{cat.unitCount} units</span>
                        <span className="text-emerald-400 font-black">${Math.round(cat.totalCost).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </>
      )}

      {/* ===== OVERVIEW CONTENT (2) ===== */}
      {activeTab === "overview" && (
        <>

      {/* ===== SALES VS OVERHEADS ===== */}
      {overheads?.global?.length > 0 && (
        <Card className="bg-slate-900/40 border-orange-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <BarChart3 className="h-4 w-4 text-orange-400" /> Month-to-Date: Sales vs Overheads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={overheads.global}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`]} />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                <Bar dataKey="sales" name="Cumulative Sales" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="overhead" name="Cumulative Overhead" fill="#f97316" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* ===== INVENTORY & STOCK TAB ===== */}
      {activeTab === "inventory" && (
        <>

      {/* ===== DEEP ANALYSIS GRID ===== */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900/40 border-rose-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <AlertTriangle className="h-4 w-4 text-rose-400" /> Dead Stock ({deadStock.length} items)
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">No sale in 60+ days · Capital tied up</CardDescription>
          </CardHeader>
          <CardContent>
            {deadStock.length === 0 ? (
              <p className="text-sm text-slate-500">No dead stock detected.</p>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {deadStock.slice(0, 10).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/40">
                    <span className="text-xs text-slate-300 truncate min-w-0 flex-1">{item.itemName}</span>
                    <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
                      <span className="text-slate-500">{item.quantity} units</span>
                      <span className="text-rose-400 w-16 text-right">${Math.round(item.value).toLocaleString()}</span>
                      <span className="text-slate-600 w-12 text-right">{item.daysInStock}d</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Clock className="h-4 w-4 text-amber-400" /> Reorder Suggestions
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Items running low · based on 30d velocity</CardDescription>
          </CardHeader>
          <CardContent>
            {reorderSuggestions.length === 0 ? (
              <p className="text-sm text-slate-500">All stock levels healthy.</p>
            ) : (
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                {reorderSuggestions.slice(0, 10).map((item) => (
                  <div key={item.itemId} className="flex items-center justify-between py-1 px-2 rounded hover:bg-slate-800/40">
                    <span className="text-xs text-slate-300 truncate min-w-0 flex-1">{item.itemName}</span>
                    <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
                      <span className="text-slate-500">{item.currentStock} left</span>
                      <span className="text-amber-400">{item.daysToZero}d</span>
                      <span className="text-emerald-400 font-black">+{item.suggestedReorder}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== INVENTORY TURNOVER BY CATEGORY ===== */}
      {inventoryTurnover.byCategory.length > 0 && (
        <Card className="bg-slate-900/40 border-cyan-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <RotateCw className="h-4 w-4 text-cyan-400" /> Inventory Turnover by Category
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              Overall: {inventoryTurnover.overall}x annualized
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {inventoryTurnover.byCategory.map((cat) => (
                <div key={cat.category} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                  <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest truncate">{cat.category}</p>
                  <p className="text-lg font-black font-mono text-cyan-400">{cat.turnover}x</p>
                  <p className="text-[9px] text-slate-500">Every {cat.daysToTurn}d</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* ===== ML ANALYTICS TAB ===== */}
      {activeTab === "analytics" && (
        <>

      {/* ===== PYTHON ML ANALYTICS ===== */}
      <Card className="bg-slate-900/40 border-violet-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <Brain className="h-4 w-4 text-violet-400" /> Python ML Analytics Engine
          </CardTitle>
          <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
            Run all 5 engines simultaneously or pick one — results open in a detail modal with PDF download
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select className="bg-slate-800 rounded px-3 py-1.5 text-xs text-white font-mono border border-slate-700" value={pythonKind} onChange={(e) => setPythonKind(e.target.value)}>
              <option value="inventory_velocity">Inventory Velocity</option>
              <option value="demand_forecast">Demand Forecast</option>
              <option value="expense_anomaly">Expense Anomaly</option>
              <option value="capital_allocation">Capital Allocation</option>
              <option value="operations_overview">Operations Overview</option>
            </select>
            <button onClick={() => runPythonAnalytics(pythonKind)} disabled={pythonRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-wider hover:bg-violet-600/30 transition-all disabled:opacity-40">
              {pythonRunning ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              {pythonRunning ? "Running..." : "Run Selected"}
            </button>
            <button onClick={() => runPythonAnalytics("all")} disabled={pythonRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-wider hover:bg-violet-600/30 transition-all disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${pythonRunning ? "animate-spin" : ""}`} />
              Run All 5
            </button>
            {Object.keys(allPythonResults).length > 0 && (
              <button onClick={() => { setShowPythonModal(true); setActivePythonTab(pythonKind); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600/30 transition-all">
                <Eye className="h-3 w-3" /> View Results
              </button>
            )}
            {pythonResult && (
              <span className={`text-[10px] font-mono ${pythonResult.includes("Error") ? "text-rose-400" : "text-emerald-400"}`}>
                {pythonResult}
              </span>
            )}
          </div>
          {Object.keys(allPythonResults).length > 0 && (
            <div className="flex flex-wrap gap-2 text-[9px] text-slate-500">
              {Object.entries(allPythonResults).map(([k, r]) => (
                <span key={k} className={`px-2 py-0.5 rounded-full border ${r.ok ? "border-emerald-500/20 text-emerald-400" : "border-rose-500/20 text-rose-400"}`}>
                  {k.replace(/_/g, " ")}: {r.ok ? "OK" : "Failed"}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== DATA QUALITY ===== */}
      <Card className="bg-slate-900/40 border-cyan-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <Activity className="h-4 w-4 text-cyan-400" /> Data Quality & System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricTile label="Total Sales Records" value={dataQuality.totalSales.toLocaleString()} sub={`${dataQuality.salesThisMonth} this month`} />
            <MetricTile label="Inventory Items" value={dataQuality.totalInventory.toLocaleString()} sub={`${dataQuality.itemsWithoutCategory > 0 ? `${dataQuality.itemsWithoutCategory} uncategorized` : "All categorized"}`} />
            <MetricTile label="Employees" value={dataQuality.totalEmployees.toString()} sub={`Across ${dataQuality.totalShops} shops`} />
            <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
              <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Last Sale</p>
              <p className="text-lg font-black font-mono text-white mt-0.5">
                {dataQuality.lastSaleDate ? new Date(dataQuality.lastSaleDate).toLocaleDateString() : "—"}
              </p>
              <p className="text-[9px] text-slate-600 mt-0.5">{dataQuality.salesWithoutClient > 0 ? `${dataQuality.salesWithoutClient} missing client name` : "Client data clean"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
        </>
      )}

      {/* ===== SALES & PRODUCTS TAB (2) ===== */}
      {activeTab === "sales" && (
        <>

      {/* ===== SHOP COMPARISON ===== */}
      {shopComparison.length > 0 && (
        <Card className="bg-slate-900/40 border-indigo-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Building2 className="h-4 w-4 text-indigo-400" /> Shop Comparison (60d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-black border-b border-slate-800">
                    <th className="text-left py-2 pr-4">Shop</th>
                    <th className="text-right py-2 pr-4">Revenue</th>
                    <th className="text-right py-2 pr-4">Sales</th>
                    <th className="text-right py-2 pr-4">Avg Ticket</th>
                    <th className="text-right py-2">Top Item</th>
                  </tr>
                </thead>
                <tbody>
                  {shopComparison.map((shop) => (
                    <tr key={shop.shopId} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 pr-4">
                        <span className="font-bold text-white">{shop.shopName}</span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-emerald-400">${shop.revenue.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right font-mono text-slate-300">{shop.salesCount}</td>
                      <td className="py-2 pr-4 text-right font-mono text-sky-400">${shop.averageTicket.toLocaleString()}</td>
                      <td className="py-2 text-right text-slate-400 truncate max-w-[120px]">{shop.topItem} ({shop.topItemQty})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* ===== OVERVIEW CONTENT (3) ===== */}
      {activeTab === "overview" && (
        <>

      {/* ===== PER-SHOP OVERHEAD ===== */}
      {overheads && (
        <Card className="bg-slate-900/40 border-indigo-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Store className="h-4 w-4 text-indigo-400" /> Per-Shop Sales vs Overhead
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {["kipasa", "dubdub", "tradecenter"].map((shopKey) => {
                const latest = (overheads[shopKey] || []).filter((d: any) => d.sales !== null).slice(-1)[0];
                if (!latest) return null;
                return (
                  <div key={shopKey} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">
                      {shopKey === "kipasa" ? "Kipasa" : shopKey === "dubdub" ? "Dub Dub" : "Trade Center"}
                    </p>
                    <p className="text-lg font-black font-mono text-emerald-400">${Math.round(latest.sales || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">Sales / ${Math.round(latest.overhead || 0).toLocaleString()} overhead</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}

      {/* ===== INTEGRATIONS TAB ===== */}
      {activeTab === "integrations" && (
        <>

      {/* ===== EXTERNAL API CONNECTORS ===== */}
      <Card className={`border ${connectorMetrics.length > 0 ? "border-cyan-500/30" : "border-slate-700/50"} bg-slate-900/40`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                <Radio className={`h-4 w-4 ${connectorMetrics.length > 0 ? "text-cyan-400" : "text-slate-500"}`} /> External API Connectors
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Pull data from Shopify, PayPal, or any REST API · Templates use placeholder URLs — replace with real Base URL, Endpoint, and API key before enabling</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowConnectorConfig(!showConnectorConfig)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-black uppercase tracking-wider hover:bg-slate-700 transition-all">
                <Settings2 className="h-3 w-3" /> Configure
              </button>
              <button onClick={refreshConnectors} disabled={connectorsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-[10px] font-black uppercase tracking-wider hover:bg-cyan-600/30 transition-all disabled:opacity-40">
                <RefreshCw className={`h-3 w-3 ${connectorsLoading ? "animate-spin" : ""}`} />
                {connectorsLoading ? "Fetching..." : "Refresh All"}
              </button>
            </div>
          </div>
        </CardHeader>
        {showConnectorConfig && (
          <CardContent className="border-b border-slate-800 pb-4 mb-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Connector Configuration</p>
                <button onClick={addDefaultConnectors} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-wider hover:text-slate-200">
                  <Plus className="h-3 w-3" /> Add Template
                </button>
              </div>
              {connectors.length === 0 ? (
                <p className="text-xs text-slate-500">No connectors configured. Click &quot;Add Template&quot; to start.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {connectors.map((c) => (
                    <div key={c.id} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateConnector(c.id, { enabled: !c.enabled })}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                              c.enabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30" : "bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600"
                            }`}>
                            {c.enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {c.enabled ? "Enabled" : "Disabled"}
                          </button>
                          <input className="bg-transparent border-b border-slate-700 text-sm text-white font-mono focus:border-cyan-500 outline-none" value={c.name} onChange={(e) => updateConnector(c.id, { name: e.target.value })} placeholder="Connector name" />
                        </div>
                        <button onClick={() => removeConnector(c.id)} className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="col-span-2"><span className="text-slate-500">Base URL</span><input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" value={c.baseUrl} onChange={(e) => updateConnector(c.id, { baseUrl: e.target.value })} placeholder="https://..." /></div>
                        <div><span className="text-slate-500">Method</span>
                          <select className="w-full bg-slate-900 rounded px-2 py-1 text-white text-[11px] border border-slate-700" value={c.method} onChange={(e) => updateConnector(c.id, { method: e.target.value as any })}>
                            <option value="GET">GET</option><option value="POST">POST</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">Endpoint</span><input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" value={c.endpoint} onChange={(e) => updateConnector(c.id, { endpoint: e.target.value })} placeholder="/api/data" /></div>
                        <div><span className="text-slate-500">Auth Type</span>
                          <select className="w-full bg-slate-900 rounded px-2 py-1 text-white text-[11px] border border-slate-700" value={c.authType} onChange={(e) => updateConnector(c.id, { authType: e.target.value as any })}>
                            <option value="none">None</option><option value="bearer">Bearer Token</option><option value="api-key">API Key Header</option><option value="basic">Basic Auth</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-slate-500">API Key / Token</span><input className="w-full bg-slate-900 rounded px-2 py-1 text-white font-mono text-[11px] border border-slate-700" type="password" value={c.apiKey || ""} onChange={(e) => updateConnector(c.id, { apiKey: e.target.value })} placeholder="sk-..." /></div>
                        <div></div>
                      </div>
                      {c.lastError && <p className="text-[10px] text-rose-400 mt-1">Last error: {c.lastError}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        )}
        {connectors.length > 0 && (
          <CardContent className="border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3 text-[10px]">
              <span className="font-black uppercase tracking-widest text-slate-500">Status:</span>
              {connectors.map((c) => (
                <span key={c.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  c.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-800 text-slate-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                  {c.name}
                </span>
              ))}
            </div>
          </CardContent>
        )}
        <CardContent>
          {connectorMetrics.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {connectorMetrics.map((m, i) => (
                <div key={`${m.connectorId}-${i}`} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ExternalLink className="h-3 w-3 text-cyan-400" />
                    <span className="text-[9px] uppercase font-black text-cyan-400 tracking-widest truncate">{m.connectorName}</span>
                  </div>
                  <p className="text-lg font-black font-mono text-white">
                    {m.unit === "$" && typeof m.value === "number" ? `$${m.value.toLocaleString()}` : m.value}
                    {m.unit && m.unit !== "$" ? <span className="text-[10px] text-slate-500 ml-0.5">{m.unit}</span> : null}
                  </p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider truncate">{m.label}</p>
                  {m.change && <span className={`text-[10px] font-black ${m.changeDirection === "up" ? "text-emerald-400" : m.changeDirection === "down" ? "text-rose-400" : "text-slate-500"}`}>{m.change}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <ExternalLink className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {connectorError || (connectors.filter((c) => c.enabled).length === 0
                  ? "No connectors enabled. Click Configure, set Base URL & Endpoint, then toggle the switch to Enabled."
                  : "Configure connectors above and click Refresh to pull external data.")}
              </p>
              <p className="text-[10px] text-slate-600 mt-1">
                {connectors.filter((c) => c.enabled).length === 0
                  ? "After adding a template, toggle the green Enabled button next to its name."
                  : "Supports Shopify, PayPal, or any REST API with bearer/api-key/basic auth"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}

      {/* ===== SHIPMENTS TAB ===== */}
      {activeTab === "shipments" && (
        <Card className="bg-slate-900/40 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
              <Truck className="h-4 w-4 text-amber-400" /> Shipments & Supplier Intelligence
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-black">
              {shipments.length} shipments on record · Click any row for full P&amp;L, item performance, and supplier recommendation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {shipments.length === 0 ? (
              <p className="text-sm text-slate-500">No shipments recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-slate-500 font-black border-b border-slate-800">
                      <th className="text-left py-2 pr-3">Supplier</th>
                      <th className="text-left py-2 pr-3">Shipment #</th>
                      <th className="text-left py-2 pr-3">Date</th>
                      <th className="text-right py-2 pr-3">Total Cost</th>
                      <th className="text-right py-2 pr-3">Items</th>
                      <th className="text-right py-2 pr-3">Qty</th>
                      <th className="text-right py-2">Pieces</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((s) => (
                      <tr key={s.id} onClick={() => openShipmentModal(s.id)}
                        className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors">
                        <td className="py-2 pr-3 font-bold text-white">{s.supplier}</td>
                        <td className="py-2 pr-3 text-slate-400 font-mono">{s.shipmentNumber}</td>
                        <td className="py-2 pr-3 text-slate-400">{s.date ? new Date(s.date).toLocaleDateString() : "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono text-amber-400">${s.totalCost.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-300">{s.itemCount}</td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-300">{s.totalQuantity}</td>
                        <td className="py-2 text-right font-mono text-slate-500">{s.manifestPieces}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== SHIPMENT DETAIL MODAL ===== */}
      {shipmentModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShipmentModal({ open: false, shipmentId: "", data: null, loading: false })}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {shipmentModal.loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-slate-500" />
                <span className="ml-3 text-sm text-slate-500">Loading shipment intelligence...</span>
              </div>
            ) : shipmentModal.data ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <Truck className="h-4 w-4 text-amber-400" /> {shipmentModal.data.supplier} — {shipmentModal.data.summary.shipmentNumber}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={async () => {
                      const data = shipmentModal.data;
                      if (!data) return;
                      const { generatePdf } = await import("@/lib/flectere/reporting");
                      const sections = [
                        { heading: `Shipment: ${data.supplier} — ${data.summary.shipmentNumber}`, body: `Date: ${data.date ? new Date(data.date).toLocaleDateString() : "N/A"} | Supplier: ${data.supplier}` },
                        { heading: "Cost Breakdown", body: `Purchase: $${data.summary.purchasePrice.toLocaleString()} | Shipping: $${data.summary.shippingCost.toLocaleString()} | Duty: $${data.summary.dutyCost.toLocaleString()} | Misc: $${data.summary.miscCost.toLocaleString()} | Total: $${data.totalCost.toLocaleString()}` },
                        { heading: "Performance Summary", body: `Revenue: $${Math.round(data.performance.totalRevenue).toLocaleString()} | Gross Profit: $${Math.round(data.performance.grossProfit).toLocaleString()} | ROI: ${data.performance.roi.toFixed(1)}% | Sell-Through: ${data.performance.sellThrough.toFixed(1)}% | Days Since Receipt: ${data.performance.daysSinceReceipt}` },
                        { heading: "Overhead Contribution", body: `Contribution: $${Math.round(data.performance.overheadContribution).toLocaleString()} (${data.performance.overheadContributionPct.toFixed(1)}% of monthly overhead)` },
                        { heading: "Items", body: "", table: { headers: ["Item", "Category", "Sold", "Left", "Revenue", "Profit", "Sell-Through"], rows: data.performance.items.map((i: any) => [i.name, i.category, String(i.soldQty), String(i.currentQty), `$${Math.round(i.revenue).toLocaleString()}`, `$${Math.round(i.grossProfit).toLocaleString()}`, `${i.sellThrough.toFixed(1)}%`]) } },
                        { heading: "Fast Movers", body: data.performance.fastMovers.length > 0 ? data.performance.fastMovers.map((i: any) => `${i.name} (${i.dailyVelocity.toFixed(2)}/day)`).join(", ") : "None" },
                        { heading: "Slow Movers", body: data.performance.slowMovers.length > 0 ? data.performance.slowMovers.map((i: any) => `${i.name} (${i.sellThrough.toFixed(1)}% sell-through)`).join(", ") : "None" },
                        { heading: "Supplier Recommendation", body: `${data.performance.supplierRecommendation.toUpperCase()}: ${data.performance.recommendationReason}` },
                      ];
                      await generatePdf(`Shipment_${data.summary.shipmentNumber}`, sections);
                    }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-wider hover:bg-rose-600/20 transition-all">
                      <Download className="h-3 w-3" /> PDF
                    </button>
                    <button onClick={() => setShipmentModal({ open: false, shipmentId: "", data: null, loading: false })} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Cost + Performance KPI row */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
                      <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Total Cost</p>
                      <p className="text-lg font-black font-mono text-amber-400">${Math.round(shipmentModal.data.totalCost).toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
                      <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Revenue Generated</p>
                      <p className="text-lg font-black font-mono text-emerald-400">${Math.round(shipmentModal.data.performance.totalRevenue).toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
                      <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Gross Profit</p>
                      <p className={`text-lg font-black font-mono ${shipmentModal.data.performance.grossProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>${Math.round(shipmentModal.data.performance.grossProfit).toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
                      <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">ROI</p>
                      <p className={`text-lg font-black font-mono ${shipmentModal.data.performance.roi >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{shipmentModal.data.performance.roi.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
                      <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Sell-Through</p>
                      <p className="text-lg font-black font-mono text-sky-400">{shipmentModal.data.performance.sellThrough.toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Items table */}
                  <div>
                    <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-2">Item Performance ({shipmentModal.data.performance.items.length} items)</p>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-slate-900">
                          <tr className="text-[9px] uppercase tracking-widest text-slate-500 font-black border-b border-slate-800">
                            <th className="text-left py-1.5 pr-2">Item</th>
                            <th className="text-left py-1.5 pr-2">Category</th>
                            <th className="text-right py-1.5 pr-2">Orig</th>
                            <th className="text-right py-1.5 pr-2">Sold</th>
                            <th className="text-right py-1.5 pr-2">Left</th>
                            <th className="text-right py-1.5 pr-2">Revenue</th>
                            <th className="text-right py-1.5 pr-2">Profit</th>
                            <th className="text-right py-1.5 pr-2">Sell-Thru</th>
                            <th className="text-right py-1.5 pr-2">Velocity</th>
                            <th className="text-right py-1.5">Mover</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipmentModal.data.performance.items.map((item) => (
                            <tr key={item.itemId} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-1.5 pr-2 text-white font-bold truncate max-w-[140px]">{item.name}</td>
                              <td className="py-1.5 pr-2 text-slate-400">{item.category}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-400">{item.originalQty}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-300">{item.soldQty}</td>
                              <td className="py-1.5 pr-2 text-right text-slate-300">{item.currentQty}</td>
                              <td className="py-1.5 pr-2 text-right text-emerald-400 font-mono">${Math.round(item.revenue).toLocaleString()}</td>
                              <td className="py-1.5 pr-2 text-right font-mono" style={{ color: item.grossProfit >= 0 ? "#10b981" : "#f43f5e" }}>${Math.round(item.grossProfit).toLocaleString()}</td>
                              <td className="py-1.5 pr-2 text-right text-sky-400">{item.sellThrough.toFixed(1)}%</td>
                              <td className="py-1.5 pr-2 text-right text-slate-400">{item.dailyVelocity.toFixed(2)}/d</td>
                              <td className="py-1.5 text-right">
                                {item.isFastMover ? <span className="text-emerald-400 font-black">Fast</span> : item.isSlowMover ? <span className="text-rose-400 font-black">Slow</span> : <span className="text-slate-600">—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Fast + Slow movers */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                      <p className="text-[10px] uppercase font-black text-emerald-400 tracking-widest mb-2">Fast Movers</p>
                      {shipmentModal.data.performance.fastMovers.length === 0 ? (
                        <p className="text-xs text-slate-500">No fast-moving items identified.</p>
                      ) : (
                        <div className="space-y-1">
                          {shipmentModal.data.performance.fastMovers.slice(0, 8).map((i) => (
                            <div key={i.itemId} className="flex justify-between text-xs">
                              <span className="text-slate-300 truncate">{i.name}</span>
                              <span className="text-emerald-400 font-mono">{i.dailyVelocity.toFixed(2)}/d · {i.sellThrough.toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                      <p className="text-[10px] uppercase font-black text-rose-400 tracking-widest mb-2">Slow Movers</p>
                      {shipmentModal.data.performance.slowMovers.length === 0 ? (
                        <p className="text-xs text-slate-500">No slow-moving items identified.</p>
                      ) : (
                        <div className="space-y-1">
                          {shipmentModal.data.performance.slowMovers.slice(0, 8).map((i) => (
                            <div key={i.itemId} className="flex justify-between text-xs">
                              <span className="text-slate-300 truncate">{i.name}</span>
                              <span className="text-rose-400 font-mono">{i.sellThrough.toFixed(1)}% · {i.currentQty} left</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Overhead contribution */}
                  <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                    <p className="text-[10px] uppercase font-black text-indigo-400 tracking-widest mb-1">Overhead Contribution</p>
                    <p className="text-sm text-slate-300">
                      This shipment generated <span className="text-emerald-400 font-bold">${Math.round(shipmentModal.data.performance.overheadContribution).toLocaleString()}</span> in revenue toward overhead,
                      covering <span className="text-indigo-400 font-bold">{shipmentModal.data.performance.overheadContributionPct.toFixed(1)}%</span> of monthly overhead costs.
                      {shipmentModal.data.performance.overheadContributionPct > 100
                        ? " Revenue exceeds overhead contribution — this is a strong shipment."
                        : " Below 100% means other shipments or revenue streams must compensate."}
                    </p>
                  </div>

                  {/* Supplier recommendation */}
                  <div className={`p-4 rounded-lg border ${shipmentModal.data.performance.supplierRecommendation === "keep" ? "bg-emerald-500/5 border-emerald-500/20" : shipmentModal.data.performance.supplierRecommendation === "review" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
                    <p className="text-[10px] uppercase font-black tracking-widest mb-1" style={{ color: shipmentModal.data.performance.supplierRecommendation === "keep" ? "#10b981" : shipmentModal.data.performance.supplierRecommendation === "review" ? "#f59e0b" : "#f43f5e" }}>
                      Supplier Recommendation: {shipmentModal.data.performance.supplierRecommendation.toUpperCase()}
                    </p>
                    <p className="text-sm text-slate-300">{shipmentModal.data.performance.recommendationReason}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-rose-400 text-center py-8">Failed to load shipment data.</p>
            )}
          </div>
        </div>
      )}

      {/* ===== ML RESULTS MODAL ===== */}
      {showPythonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPythonModal(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-400" /> ML Analytics Results
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={async () => {
                  const h2c = (await import("html2canvas")).default;
                  const mlCard = document.querySelector("#ml-results-content");
                  let mlChart: string | null = null;
                  if (mlCard instanceof HTMLElement) {
                    mlChart = await h2c(mlCard, { backgroundColor: "#0f172a", scale: 2 }).then((c) => c.toDataURL("image/png")).catch(() => null);
                  }
                  const sections: any[] = [];
                  for (const [kind, result] of Object.entries(allPythonResults)) {
                    if (result?.ok && result?.payload) {
                      sections.push({ heading: kind.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()), body: result.summary || "", payload: result.payload });
                    }
                  }
                  const { generatePdf } = await import("@/lib/flectere/reporting");
                  await generatePdf("ML_Analytics_Report", sections, mlChart ? [{ img: mlChart, heading: "ML Results Overview" }] : []);
                }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/10 border border-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-wider hover:bg-rose-600/20 transition-all">
                  <Download className="h-3 w-3" /> PDF
                </button>
                <button onClick={() => setShowPythonModal(false)} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div id="ml-results-content" className="space-y-4">
              {Object.keys(allPythonResults).length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Run an ML engine to see results here.</p>
              ) : (
                <>
                  {/* Kind tabs */}
                  <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-2">
                    {Object.entries(allPythonResults).map(([kind, result]) => (
                      <button key={kind} onClick={() => setActivePythonTab(kind)}
                        className={`px-3 py-1.5 rounded-t text-[10px] font-black uppercase tracking-wider transition-all ${activePythonTab === kind
                          ? "bg-violet-600/20 text-violet-300 border border-violet-500/30 border-b-transparent"
                          : "text-slate-500 hover:text-slate-300 border border-transparent"
                        } ${!result?.ok ? "opacity-40" : ""}`}>
                        {kind.replace(/_/g, " ")}
                        {result?.ok ? " ✓" : " ✗"}
                      </button>
                    ))}
                  </div>
                  {/* Active tab content */}
                  {(() => {
                    const activeResult = allPythonResults[activePythonTab];
                    if (!activeResult) return <p className="text-sm text-slate-500">No data for this engine.</p>;
                    if (!activeResult.ok) return <p className="text-sm text-rose-400">Error: {activeResult.error || "Unknown"}</p>;
                    const payload = activeResult.payload;
                    if (!payload) return <p className="text-sm text-slate-500">No payload returned.</p>;
                    return (
                      <div className="space-y-3">
                        {activeResult.summary && (
                          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50">
                            <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1">Summary</p>
                            <p className="text-sm text-white">{activeResult.summary}</p>
                          </div>
                        )}
                        {renderPythonPayload(activePythonTab, payload)}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== DRILL-DOWN MODAL ===== */}
      {drillDown.open && drillDown.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDrillDown({ open: false })}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                <Search className="h-4 w-4 inline-block text-emerald-400 mr-2" />
                {drillDown.date || "Transaction Detail"}
              </h3>
              <button onClick={() => setDrillDown({ open: false })} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between p-2 rounded bg-slate-800/40">
                <span className="text-[10px] uppercase font-black text-slate-500">Revenue</span>
                <span className="text-sm font-mono text-emerald-400">${(drillDown.data.revenue || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-slate-800/40">
                <span className="text-[10px] uppercase font-black text-slate-500">Profit</span>
                <span className={`text-sm font-mono ${(drillDown.data.profit || 0) >= 0 ? "text-sky-400" : "text-rose-400"}`}>
                  ${(drillDown.data.profit || 0).toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-slate-600 mt-4">Click the date label on the revenue chart to drill into any day&apos;s performance.</p>
          </div>
        </div>
      )}

      {/* ===== PERFORMANCE SUMMARY ===== */}
      <Card className="bg-slate-900/40 border-emerald-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
            <Zap className="h-4 w-4 text-emerald-400" /> Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricTile label="Total Inventory Value" value={`$${totalInventoryValue.toLocaleString()}`} />
            <MetricTile label="Premium Markup (65%)" value={`$${Math.round(premiumValue).toLocaleString()}`} />
            <MetricTile label="Break-Even (35%)" value={`$${Math.round(breakEvenValue).toLocaleString()}`} />
            <MetricTile label="Lean (25%)" value={`$${Math.round(leanValue).toLocaleString()}`} />
            <MetricTile label="Gross Margin (60d)" value={`${grossMargin.marginPct}%`} sub={`$${grossMargin.grossProfit.toLocaleString()}`} />
            <MetricTile label="Inventory Turnover" value={`${inventoryTurnover.overall}x`} sub="Annualized" />
            <MetricTile label="Cash Runway" value={cashFlow.runway >= 999 ? "∞" : `${cashFlow.runway.toFixed(1)}m`} sub={`$${cashFlow.netProjected.toLocaleString()} net`} />
            <MetricTile label="Payment Methods" value={`${paymentMethods.length}`} sub={paymentMethods[0]?.method || "—"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function renderPythonPayload(kind: string, payload: any) {
  if (!payload || typeof payload !== "object") {
    return <p className="text-sm text-slate-500">No structured data available.</p>;
  }

  // Handle array payloads (e.g. anomaly list, velocity list)
  if (Array.isArray(payload)) {
    const entries = payload.slice(0, 20);
    if (entries.length === 0) return <p className="text-sm text-slate-500">Empty result set.</p>;
    const keys = Object.keys(entries[0] || {}).slice(0, 6);
    return (
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {entries.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/20 border border-slate-700/30 hover:bg-slate-800/40">
            <span className="text-xs text-slate-300 truncate min-w-0 flex-1">{item.name || item.item || item.item_name || `#${i + 1}`}</span>
            <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
              {keys.filter((k) => k !== "name" && k !== "item" && k !== "item_name" && k !== "itemId" && k !== "item_id").slice(0, 4).map((k) => {
                const v = item[k];
                const display = typeof v === "number"
                  ? (k.includes("amount") || k.includes("price") || k.includes("revenue") || k.includes("value") || k.includes("cost")
                    ? `$${Math.round(v).toLocaleString()}`
                    : k.includes("pct") || k.includes("rate") ? `${(v * 100).toFixed(1)}%` : String(v))
                  : String(v).slice(0, 20);
                return <span key={k} className="text-slate-400">{display}</span>;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Object payload — render as metric tiles
  const entries = Object.entries(payload).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) return <p className="text-sm text-slate-500">No metrics available.</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {entries.slice(0, 24).map(([key, val]) => {
        const display = typeof val === "number"
          ? (key.includes("amount") || key.includes("price") || key.includes("revenue") || key.includes("value") || key.includes("cost") || key.includes("budget")
            ? `$${Math.round(val).toLocaleString()}`
            : key.includes("pct") || key.includes("rate") ? `${(val * 100).toFixed(1)}%`
            : key.includes("count") || key.includes("total") ? val.toLocaleString()
            : String(val))
          : typeof val === "object" ? JSON.stringify(val).slice(0, 60)
          : String(val).slice(0, 40);
        return (
          <div key={key} className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
            <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest truncate">{key.replace(/_/g, " ")}</p>
            <p className="text-sm font-black font-mono text-white mt-0.5 truncate">{display}</p>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, note }: { icon: React.ReactNode; label: string; value: string; sub?: string; note?: string }) {
  return (
    <Card className="bg-slate-900/40 border-slate-700/50">
      <CardHeader className="pb-1">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-black font-mono text-white">{value}</p>
        {sub && <p className="text-[10px] text-slate-600 font-bold uppercase mt-0.5">{sub}</p>}
        {note && <p className="text-[9px] text-slate-600/70 mt-0.5 italic">{note}</p>}
      </CardContent>
    </Card>
  );
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-lg bg-slate-800/20 border border-slate-700/30">
      <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{label}</p>
      <p className="text-lg font-black font-mono text-white mt-0.5">{value}</p>
      {sub && <p className="text-[9px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}
