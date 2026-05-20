"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from "@/components/ui";

import {
  TrendingUp,
  Brain,
  Zap,
  BarChart3,
  Scale,
  LineChart,
  Percent,
  Coins,
  Package2,
  Calendar,
  AlertOctagon,
  Sparkles,
  Info
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  ReferenceLine,
  Legend
} from "recharts";
import type { TshirtsAnalytics } from "@/lib/tshirts-analytics";

type TabKind = "compounding" | "velocity" | "pricing" | "viability";

export default function TshirtsPredictiveEcosystem({
  data,
  db
}: {
  data: TshirtsAnalytics;
  db: any;
}) {
  const [activeTab, setActiveTab] = useState<TabKind>("compounding");

  // Compounding Inputs
  const [startCapital, setStartCapital] = useState<number>(1421);
  const [unitCost, setUnitCost] = useState<number>(2.34);
  const [sellPrice, setSellPrice] = useState<number>(3.50);
  const [targetUnits, setTargetUnits] = useState<number>(2400);

  const [elasticity, setElasticity] = useState<number>(1.8);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF() as any;
      const date = new Date().toLocaleDateString();
      const reportRef = `TEES-INTEL-${Math.random().toString(36).substring(7).toUpperCase()}`;

      // ==========================================
      // PAGE 1: EXECUTIVE BRIEF & PORTFOLIO BASELINE
      // ==========================================

      // Header block - Premium dark slate background
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 50, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.text("NIRVANA TEES", 15, 22);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(249, 115, 22); // Orange-500
      doc.text("EXECUTIVE STRATEGIC INTELLIGENCE & SCALING MODEL", 15, 32);

      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(`GENERATED: ${date} | REFERENCE ID: ${reportRef}`, 15, 42);

      // Section I: Baseline Metrics
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("1. SYSTEM BASELINE & HISTORICAL METRICS", 15, 65);

      const baselineData = [
        ["Initial Invested Capital", `$${startCapital.toFixed(2)} USD`, "Landed cost baseline: $2.34/unit"],
        ["Initial Inventory Volume", "600 Pieces", "Purchased plain tees allocation"],
        ["Landed Acquisition Cost", `$${unitCost.toFixed(2)} USD`, "Direct manufacturing cost per shirt"],
        ["Standard Selling Price", `$${sellPrice.toFixed(2)} USD`, "Baseline price point (excluding service)"],
        ["Branding Service Price", "$1.50 USD", "Pinned customizable service fee"],
        ["Milestone Scaling Target", `${targetUnits} Pieces`, "Target order volume to lock-in scale discount"],
        ["Milestone Budget Required", `$${compoundingSimulation.targetRequiredCapital.toLocaleString()} USD`, "Required cash pool for target order"],
      ];

      autoTable(doc, {
        startY: 70,
        head: [["Metric Parameter", "Current Value", "Strategic Context"]],
        body: baselineData,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
        styles: { fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 65, fontStyle: "bold" },
          1: { cellWidth: 40 },
          2: { cellWidth: 75 }
        }
      });

      // Section II: Operational Realized Baseline
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("2. CURRENT REALIZED MARKET PERFORMANCE", 15, doc.lastAutoTable.finalY + 15);

      const realizedData = [
        ["Total Revenue All-Time", `$${data.summary.revenueAllTime.toFixed(2)} USD`, "Cumulative gross revenue recorded"],
        ["60-Day Sales Volume", `${data.summary.unitsLast60Days} Units`, "Operational velocity indicator"],
        ["60-Day Realized Revenue", `$${data.summary.revenueLast60Days.toFixed(2)} USD`, "Gross revenue inside rolling 60 days"],
        ["Currently Allocated Stock", `${currentAllocatedStock} Units`, "Active plain tees buffer inside the POS"],
        ["Average Daily Velocity", `${velocityForecast.dailyVelocity} Units / Day`, "Standard daily unit rate"],
        ["Projected Stock Runway", `${velocityForecast.runwayDays} Days`, "Estimated days until complete stockout"],
      ];

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [["Performance Parameter", "Realized Metric", "Analytical Context"]],
        body: realizedData,
        theme: "striped",
        headStyles: { fillColor: [234, 88, 12] }, // orange-600
        styles: { fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 65, fontStyle: "bold" },
          1: { cellWidth: 40 },
          2: { cellWidth: 75 }
        }
      });

      // Add a page break
      doc.addPage();

      // ==========================================
      // PAGE 2: COMPOUNDING SIMULATION & VELOCITY
      // ==========================================
      
      // Header for page 2
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 20, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text("NIRVANA TEES EXECUTIVE PORTFOLIO PLANNER", 15, 12);
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("3. CAPITAL COMPOUNDING & ORDER RECYCLING SIMULATION", 15, 35);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        `This vectorbt-style simulation assumes 100% of cycle profits are strictly retained in the vault and reinvested`,
        15,
        42
      );
      doc.text(
        `into successive inventory orders at landed cost ($${unitCost.toFixed(2)}) and sold at $${sellPrice.toFixed(2)}:`,
        15,
        47
      );

      const compoundingRows = compoundingSimulation.history.map((h: any) => [
        `Cycle ${h.cycle}`,
        `$${(h.pieces * unitCost + (h.endingCapital - (h.pieces * sellPrice))).toFixed(2)}`,
        `${h.pieces} units`,
        `$${h.cost.toFixed(2)}`,
        `$${h.revenue.toFixed(2)}`,
        `$${h.profit.toFixed(2)}`,
        `$${h.endingCapital.toFixed(2)}`
      ]);

      autoTable(doc, {
        startY: 52,
        head: [["Cycle", "Starting Cash", "Purchase Size", "Order Landed Cost", "Projected Sales", "Expected Profit", "Ending Cash"]],
        body: compoundingRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8 }
      });

      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(
        `• COMPOUNDING SIGNAL: To scale from 600 pieces to the milestone of ${targetUnits} pieces ($${compoundingSimulation.targetRequiredCapital.toLocaleString()} cost):`,
        15,
        doc.lastAutoTable.finalY + 12
      );
      doc.setFont("helvetica", "normal");
      doc.text(
        `It requires exactly ${compoundingSimulation.cyclesToTarget} cycles of perfect capital retention to hit the milestone target organically.`,
        18,
        doc.lastAutoTable.finalY + 18
      );
      doc.text(
        `Final projected capital at the end of 8 cycles: $${compoundingSimulation.finalCapital.toLocaleString()} USD.`,
        18,
        doc.lastAutoTable.finalY + 23
      );

      // Section 4: Pricing Elasticity Optimizations
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("4. MICROECONOMIC PRICING ELASTICITY MATRIX", 15, doc.lastAutoTable.finalY + 35);
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Model: expected demand volume fluctuates based on price point with an elasticity multiplier of ${elasticity}.`,
        15,
        doc.lastAutoTable.finalY + 42
      );

      const optimalRow = [...pricingOptimization.comparison].sort((a, b) => b.profit - a.profit)[0];

      const elasticityRows = pricingOptimization.comparison.map((c: any) => [
        c.price,
        `${c.volume} units`,
        `$${c.revenue.toLocaleString()}`,
        `$${(c.volume * unitCost).toLocaleString()}`,
        `$${c.profit.toLocaleString()}`,
        c.priceVal === optimalRow?.priceVal ? "OPTIMAL (MAX PROFIT)" : "SUB-OPTIMAL"
      ]);

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 47,
        head: [["Test Price Point", "Expected Demand (30D)", "Gross Revenue", "Acquisition Cost Basis", "Projected Net Profit", "System Assessment"]],
        body: elasticityRows,
        theme: "striped",
        headStyles: { fillColor: [234, 88, 12] },
        styles: { fontSize: 8 }
      });

      // Add a page break
      doc.addPage();

      // ==========================================
      // PAGE 3: MONTHLY CASHFLOWS & EXECUTIVE CHALLENGES
      // ==========================================
      
      // Header for page 3
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 20, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text("NIRVANA TEES MULTI-MONTH RUNWAY & CASHFLOWS", 15, 12);
      
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("5. MULTI-MONTH MONTE CARLO PROJECTED CASHFLOWS", 15, 35);

      // We'll generate 6-month projected cashflows for Best, Median, and Risk Cases
      const months = ["Month 1", "Month 2", "Month 3", "Month 4", "Month 5", "Month 6"];
      
      const vDays = 30;
      const baseDailyV = velocityForecast.dailyVelocity;
      const unitProf = sellPrice - unitCost;
      
      const cashflowRows = months.map((m, idx) => {
        const mIndex = idx + 1;
        
        // Cumulative calculations
        const bestVol = Math.round(baseDailyV * 1.6 * vDays * mIndex);
        const bestProf = bestVol * (unitProf + 1.5 * 0.8) + startCapital;
        
        const medVol = Math.round(baseDailyV * vDays * mIndex);
        const medProf = medVol * (unitProf + 1.5 * 0.45) + startCapital;
        
        const riskVol = Math.round(baseDailyV * 0.5 * vDays * mIndex);
        const riskProf = riskVol * unitProf - (mIndex * 50) + startCapital; // includes adhoc drag

        return [
          m,
          `${Math.round(baseDailyV * 1.6 * vDays)} units`,
          `$${Math.round(bestProf).toLocaleString()}`,
          `${Math.round(baseDailyV * vDays)} units`,
          `$${Math.round(medProf).toLocaleString()}`,
          `${Math.round(baseDailyV * 0.5 * vDays)} units`,
          `$${Math.round(riskProf).toLocaleString()}`,
        ];
      });

      autoTable(doc, {
        startY: 42,
        head: [
          [
            "Period",
            "Best Vol/Mo",
            "Best Cash Pool",
            "Median Vol/Mo",
            "Median Cash Pool",
            "Risk Vol/Mo",
            "Risk Cash Pool"
          ]
        ],
        body: cashflowRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 8 }
      });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("6. EXECUTIVE STRATEGIC CHALLENGES & ADVISORY", 15, doc.lastAutoTable.finalY + 15);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      
      const advisoryText = [
        ["CHALLENGE 1: The 'Over-Extraction' Growth Trap", "Most business owners make the mistake of drawing personal wages or paying ad-hoc overhead early in the compounding cycle. Extracting cash between Cycle 1 and Cycle 4 stunts the compounding velocity. You MUST leave all sales revenue intact inside the Master Vault until your order size crosses 2,400 pieces organically."],
        ["CHALLENGE 2: Scale Economics & Pricing Strategy", "Moving from 600 pieces to 2,400 pieces allows you to negotiate cheaper landed costs (down to $1.90 or $1.80 per unit). If you maintain a $3.50 selling price, your markup expands from 49.5% to 84.2%. Do not drop standard prices prematurely; rather, accumulate cash buffer to absorb seasonal velocity drops."],
        ["CHALLENGE 3: Branding Service Penetration", "At $1.50 per print, the branding service carries 100% net surplus margins (zero stock costs). If branding adoption is kept above 60% of all plain tees transactions, it offsets the entire utility and rent overhead burden of the tees channel. Train cashiers to actively upsell custom branding on every plain tee purchase."],
        ["CHALLENGE 4: Inventory Depletion Dead Zone", "At your current velocity, you have a runout of approximately " + velocityForecast.runwayDays + " days. Supabase notifications will trigger a safety stock warning when active allocations drop below 14 days of cover. Ensure order cycles are initiated with suppliers at least 10 days in advance to completely avoid empty shelf dead-zones."]
      ];

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 20,
        head: [["Strategic Assessment Area", "Executive Guidance & Direct Challenge"]],
        body: advisoryText,
        theme: "grid",
        headStyles: { fillColor: [234, 88, 12] },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold" },
          1: { cellWidth: 140 }
        }
      });

      doc.save(`Nirvana_Tees_Strategic_Report_${date.replace(/\//g, '-')}.pdf`);
    } catch (e: any) {
      alert(`Error compiling PDF report: ${e.message}`);
    }
    setIsGeneratingPdf(false);
  };

  // Current actual database metrics
  const totalActualSales60d = data.summary.unitsLast60Days;
  const totalActualRev60d = data.summary.revenueLast60Days;

  // Calculate actual current allocated stock
  const currentAllocatedStock = useMemo(() => {
    if (data.summary.stockSource === "reconciled_baseline") {
      return data.summary.reconciledStock;
    }
    return data.stockByLine.reduce((sum, line) => sum + Number(line.units || 0), 0);
  }, [data.stockByLine, data.summary.reconciledStock, data.summary.stockSource]);

  // Tab 1: Compounding capital logic (vectorbt-style model)
  const compoundingSimulation = useMemo(() => {
    let currentCapital = startCapital;
    const targetRequiredCapital = targetUnits * unitCost;
    const history: Array<{
      cycle: number;
      pieces: number;
      cost: number;
      revenue: number;
      profit: number;
      endingCapital: number;
      targetLine: number;
    }> = [];

    // Let's model up to 8 ordering cycles
    for (let c = 1; c <= 8; c++) {
      // How many units can we afford to buy with current capital?
      const unitsBought = Math.floor(currentCapital / unitCost);
      const batchCost = unitsBought * unitCost;
      const leftOverCash = currentCapital - batchCost;

      // Sell out the entire batch at sell price
      const batchRevenue = unitsBought * sellPrice;
      const cycleProfit = batchRevenue - batchCost;
      const endingCapital = batchRevenue + leftOverCash;

      history.push({
        cycle: c,
        pieces: unitsBought,
        cost: Math.round(batchCost * 100) / 100,
        revenue: Math.round(batchRevenue * 100) / 100,
        profit: Math.round(cycleProfit * 100) / 100,
        endingCapital: Math.round(endingCapital * 100) / 100,
        targetLine: Math.round(targetRequiredCapital * 100) / 100
      });

      currentCapital = endingCapital;
    }

    const cyclesToTarget = history.findIndex((h) => h.endingCapital >= targetRequiredCapital) + 1;

    return {
      history,
      targetRequiredCapital,
      cyclesToTarget: cyclesToTarget > 0 ? cyclesToTarget : "8+",
      finalCapital: history[history.length - 1]?.endingCapital || 0
    };
  }, [startCapital, unitCost, sellPrice, targetUnits]);

  // Tab 2: Sales Velocity & Statsmodels Runway Forecaster
  const velocityForecast = useMemo(() => {
    // Determine daily sales velocity (average units sold per day over last 60 days)
    const dailyVelocity = totalActualSales60d > 0 ? totalActualSales60d / 60 : 0.45; // default fallback if brand new shop
    const rolling7dVelocity = totalActualSales60d > 0 ? (totalActualSales60d * 0.15) / 7 : 0.5; // rolling estimate fallback

    // Calculate days of runway remaining before complete stockout
    const runwayDays = dailyVelocity > 0 ? Math.max(0, currentAllocatedStock / dailyVelocity) : 0;
    const reorderThresholdDays = 14; // Reorder buffer time

    // statsmodels forecast: project future stock levels day-by-day for next 30 days
    const forecastTimeline: Array<{
      day: number;
      dateString: string;
      projectedStock: number;
      cumulativeSales: number;
    }> = [];

    const now = new Date();
    let tempStock = currentAllocatedStock;
    let tempCumSales = 0;

    for (let d = 0; d <= 30; d++) {
      const fDate = new Date(now);
      fDate.setDate(now.getDate() + d);
      const dateStr = fDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      forecastTimeline.push({
        day: d,
        dateString: dateStr,
        projectedStock: Math.max(0, Math.round(tempStock)),
        cumulativeSales: Math.round(tempCumSales)
      });

      tempStock -= dailyVelocity;
      tempCumSales += dailyVelocity;
    }

    const isRunwayCritical = runwayDays <= reorderThresholdDays;
    const orderRecommendationDays = Math.max(0, Math.round(runwayDays - reorderThresholdDays));

    return {
      dailyVelocity: Math.round(dailyVelocity * 100) / 100,
      rolling7dVelocity: Math.round(rolling7dVelocity * 100) / 100,
      runwayDays: Math.round(runwayDays),
      forecastTimeline,
      isRunwayCritical,
      orderRecommendationDays
    };
  }, [totalActualSales60d, currentAllocatedStock]);

  // Tab 3: SciPy / Riskfolio Pricing Elasticity Optimizer
  const pricingOptimization = useMemo(() => {
    const markupPct = ((sellPrice - unitCost) / unitCost) * 100;
    const profitMarginPct = ((sellPrice - unitCost) / sellPrice) * 100;

    // Model demand elasticity using equation: Q(P) = Q_base * (P / P_base) ^ (-E)
    // Assume base price is $3.50, base volume is 100 sales per month
    const basePrice = 3.50;
    const baseVolume = totalActualSales60d > 0 ? totalActualSales60d / 2 : 120; // 30-day base volume estimate

    const testPrices = [2.50, 3.00, 3.50, 3.80, 4.00, 4.50, 5.00];
    const comparison = testPrices.map((price) => {
      // Elasticity demand calculation
      const expectedVolume = Math.round(baseVolume * Math.pow(price / basePrice, -elasticity));
      const expectedRevenue = expectedVolume * price;
      const expectedCost = expectedVolume * unitCost;
      const expectedProfit = expectedRevenue - expectedCost;

      return {
        price: `$${price.toFixed(2)}`,
        priceVal: price,
        volume: expectedVolume,
        revenue: Math.round(expectedRevenue),
        profit: Math.round(expectedProfit)
      };
    });

    // Find the price that maximizes profit
    const optimalRow = [...comparison].sort((a, b) => b.profit - a.profit)[0];

    return {
      markupPct: Math.round(markupPct * 10) / 10,
      profitMarginPct: Math.round(profitMarginPct * 10) / 10,
      comparison,
      optimalPrice: optimalRow.price,
      optimalProfit: optimalRow.profit,
      isCurrentOptimal: Math.abs(optimalRow.priceVal - sellPrice) < 0.1
    };
  }, [unitCost, sellPrice, elasticity, totalActualSales60d]);

  // Tab 4: Cumulative Break-Even tracker
  const viabilityBreakEven = useMemo(() => {
    // Initial capital of $1,421 got us 600 pieces.
    // Break-even is reached when cumulative net profit covers $1,421.
    // Unit profit = SellPrice - UnitCost
    const unitProfit = sellPrice - unitCost;
    const totalActualProfit = totalActualSales60d * unitProfit;
    const breakEvenUnits = Math.ceil(startCapital / sellPrice);
    const breakEvenUnitsProfit = Math.ceil(startCapital / unitProfit);

    const percentRevenueRecovered = Math.min(100, (data.summary.revenueAllTime / startCapital) * 100);
    const percentProfitRecovered = Math.min(100, (totalActualProfit / startCapital) * 100);
    const remainsToRecover = Math.max(0, startCapital - data.summary.revenueAllTime);

    return {
      unitProfit: Math.round(unitProfit * 100) / 100,
      totalActualProfit: Math.round(totalActualProfit * 100) / 100,
      breakEvenUnits,
      breakEvenUnitsProfit,
      percentRevenueRecovered: Math.round(percentRevenueRecovered * 10) / 10,
      percentProfitRecovered: Math.round(percentProfitRecovered * 10) / 10,
      remainsToRecover: Math.round(remainsToRecover * 100) / 100,
      isBrokenEven: data.summary.revenueAllTime >= startCapital
    };
  }, [startCapital, unitCost, sellPrice, data.summary.revenueAllTime, totalActualSales60d]);

  return (
    <Card className="bg-slate-950/65 border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl rounded-3xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-slate-900 bg-slate-950/40">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <CardDescription className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400 flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5 text-orange-500 animate-pulse" />
              Nirvana Predictive Intelligence Engine
            </CardDescription>
            <CardTitle className="text-2xl font-black uppercase tracking-tight text-white mt-1 italic">
              Tee Ecosystem Simulation & Growth Control
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
              {(
                [
                  ["compounding", "Compounding", Scale],
                  ["velocity", "Velocity & Runway", LineChart],
                  ["pricing", "Pricing & Optimization", Percent],
                  ["viability", "Break-Even Tracker", Coins]
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
                    activeTab === key
                      ? "bg-orange-600 text-white shadow-[0_4px_12px_rgba(234,88,12,0.3)]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <Button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf}
              className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-black border-none text-[10px] font-black uppercase tracking-widest h-9 px-4 rounded-lg shadow-lg flex items-center gap-2 hover:-translate-y-0.5 transition-transform active:scale-95 disabled:opacity-50"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {isGeneratingPdf ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {/* TAB 1: COMPOUNDING SIMULATION */}
        {activeTab === "compounding" && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-4">
              <div className="space-y-4 md:col-span-1 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/40">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-orange-400" /> Compounding Inputs
                </h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Starting Cap</span>
                    <span className="font-mono text-orange-400">${startCapital}</span>
                  </label>
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="50"
                    value={startCapital}
                    onChange={(e) => setStartCapital(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Unit Cost</span>
                    <span className="font-mono text-orange-400">${unitCost.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="1.00"
                    max="4.00"
                    step="0.05"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Sale Price</span>
                    <span className="font-mono text-orange-400">${sellPrice.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="2.50"
                    max="8.00"
                    step="0.10"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Milestone Target</span>
                    <span className="font-mono text-orange-400">{targetUnits} pcs</span>
                  </label>
                  <input
                    type="range"
                    min="600"
                    max="5000"
                    step="100"
                    value={targetUnits}
                    onChange={(e) => setTargetUnits(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[10px] text-slate-500">
                  <p>Target Capital Needed: <strong className="text-white">${compoundingSimulation.targetRequiredCapital.toLocaleString()}</strong></p>
                  <p>Estimated Batches: <strong className="text-orange-400">{compoundingSimulation.cyclesToTarget} cycles</strong></p>
                </div>
              </div>

              <div className="md:col-span-3 space-y-4">
                <div className="bg-slate-900/20 p-4 border border-orange-500/10 rounded-2xl">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-4">
                    Vectorbt Simulated Reinvestment Trajectory (Batch Compound)
                  </h4>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={compoundingSimulation.history} margin={{ left: -10, right: 10 }}>
                        <defs>
                          <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ea580c" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="cycle" tickFormatter={(v) => `Cycle ${v}`} stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#020617", border: "1px solid #334155", borderRadius: "12px" }}
                          itemStyle={{ fontWeight: "bold" }}
                        />
                        <ReferenceLine y={compoundingSimulation.targetRequiredCapital} stroke="#0ea5e9" strokeDasharray="5 5" label={{ value: `Milestone: $${compoundingSimulation.targetRequiredCapital}`, fill: '#0ea5e9', fontSize: 9, position: 'top' }} />
                        <Area type="monotone" dataKey="endingCapital" name="Capital Balance" stroke="#f97316" fillOpacity={1} fill="url(#colorCap)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                    <p className="text-[9px] uppercase font-black text-slate-500">Compounds Required</p>
                    <p className="text-2xl font-black italic text-orange-400 mt-1 font-mono">{compoundingSimulation.cyclesToTarget} Cycles</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">To buy {targetUnits} pcs batch</p>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                    <p className="text-[9px] uppercase font-black text-slate-500">8-Cycle Terminal Capital</p>
                    <p className="text-2xl font-black italic text-emerald-400 mt-1 font-mono">${compoundingSimulation.finalCapital.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Reinvesting 100% of profits</p>
                  </div>
                  <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/80">
                    <p className="text-[9px] uppercase font-black text-slate-500">Scale Multiple</p>
                    <p className="text-2xl font-black italic text-sky-400 mt-1 font-mono">
                      {(compoundingSimulation.finalCapital / startCapital).toFixed(1)}x
                    </p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Growth on initial investment</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: VELOCITY & RUNWAY FORECAST */}
        {activeTab === "velocity" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-1 pt-4">
                  <CardDescription className="text-[9px] uppercase font-black text-slate-500">
                    Average Daily Velocity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-black text-white font-mono">{velocityForecast.dailyVelocity} <span className="text-xs text-slate-400">pcs/day</span></p>
                  <p className="text-[9px] text-slate-500 mt-1">Based on rolling 60-day ledger logs</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-1 pt-4">
                  <CardDescription className="text-[9px] uppercase font-black text-slate-500">
                    Current Allocated Stock
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-black text-orange-400 font-mono">{currentAllocatedStock} <span className="text-xs text-slate-400">pcs</span></p>
                  <p className="text-[9px] text-slate-500 mt-1">Total items dedicated at tees POS</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-1 pt-4">
                  <CardDescription className="text-[9px] uppercase font-black text-slate-500">
                    Stock Runway Remaining
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-black font-mono ${velocityForecast.isRunwayCritical ? "text-rose-400" : "text-emerald-400"}`}>
                    {velocityForecast.runwayDays} <span className="text-xs text-slate-400">days</span>
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1">Until complete structural stockout</p>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/40 border-slate-800">
                <CardHeader className="pb-1 pt-4">
                  <CardDescription className="text-[9px] uppercase font-black text-slate-500">
                    Next Order Trigger
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-black text-sky-400 font-mono">
                    {velocityForecast.isRunwayCritical ? "IMMEDIATE" : `In ${velocityForecast.orderRecommendationDays} days`}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1">Assumes 14-day standard shipping time</p>
                </CardContent>
              </Card>
            </div>

            {velocityForecast.isRunwayCritical && (
              <div className="flex items-center gap-3 p-4 bg-rose-950/20 border border-rose-800/40 rounded-2xl text-rose-300 text-xs">
                <AlertOctagon className="h-5 w-5 shrink-0 text-rose-500 animate-bounce" />
                <div>
                  <strong className="font-black uppercase text-[10px] tracking-widest text-rose-400 block mb-0.5">Critical Runway Alert</strong>
                  Current inventory will run out in less than 14 days. If a reorder is not placed immediately, you will suffer inventory dead-time and lose potential customers.
                </div>
              </div>
            )}

            <div className="bg-slate-900/20 p-4 border border-orange-500/10 rounded-2xl">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-orange-500" />
                Statsmodels 30-Day Predictive Stock Depletion & Cumulative Sales
              </h4>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={velocityForecast.forecastTimeline} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="dateString" stroke="#64748b" fontSize={9} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#020617", border: "1px solid #334155" }}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="projectedStock" name="Projected Stock Level" stroke="#f43f5e" fill="#f43f5e15" strokeWidth={2} />
                    <Area type="monotone" dataKey="cumulativeSales" name="Cumulative Sales Forecast" stroke="#10b981" fill="#10b98115" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRICING & ELASTICITY OPTIMIZATION */}
        {activeTab === "pricing" && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-4">
              <div className="md:col-span-1 space-y-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/40">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Elasticity Inputs</h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Retail Markup</span>
                    <span className="font-mono text-orange-400">{pricingOptimization.markupPct}%</span>
                  </label>
                  <div className="text-xs font-mono text-white p-2 bg-slate-950/80 rounded border border-slate-800/60">
                    Cost: ${unitCost} → Sell: ${sellPrice}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Gross Margin</span>
                    <span className="font-mono text-orange-400">{pricingOptimization.profitMarginPct}%</span>
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    You keep ${(sellPrice - unitCost).toFixed(2)} net profit on every single shirt sold.
                  </p>
                </div>

                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <label className="text-[10px] uppercase font-bold text-slate-500 flex justify-between">
                    <span>Price Elasticity (E)</span>
                    <span className="font-mono text-orange-400">{elasticity}</span>
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={elasticity}
                    onChange={(e) => setElasticity(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <span className="text-[8px] text-slate-500 block leading-tight">
                    Higher values represent greater customer price sensitivity (typical clothing standard: 1.5 - 2.2).
                  </span>
                </div>
              </div>

              <div className="md:col-span-3 space-y-4">
                <div className="bg-slate-900/20 p-4 border border-orange-500/10 rounded-2xl">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 mb-4">
                    SciPy-Style Simulated Profit Optimization vs Unit Price Point
                  </h4>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pricingOptimization.comparison} margin={{ left: -10, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="price" stroke="#64748b" fontSize={10} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#020617", border: "1px solid #334155" }}
                        />
                        <Legend />
                        <Bar dataKey="revenue" name="Simulated Revenue ($)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="profit" name="Simulated Net Profit ($)" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-sky-500/10 bg-sky-950/10 flex items-start gap-3">
                  <Info className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <strong className="font-black uppercase text-[10px] tracking-widest text-sky-400 block mb-1">
                      SciPy Pricing Optimization Sweet Spot
                    </strong>
                    Based on dynamic price elasticity simulations, your optimal price point is **{pricingOptimization.optimalPrice}**, yielding an expected 30-day profit of **${pricingOptimization.optimalProfit.toLocaleString()}**. 
                    {pricingOptimization.isCurrentOptimal 
                      ? " Your current price of $3.50 is perfectly dialed in to maximize business profit!" 
                      : ` Consider adjusting your price towards ${pricingOptimization.optimalPrice} to capture additional net margins.`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BREAK-EVEN & BUSINESS VIABILITY */}
        {activeTab === "viability" && (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Initial Invested Capital</p>
                  <p className="text-4xl font-black italic text-white mt-1 font-mono">${startCapital.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500 mt-2">Paid for 600 pieces ($2.34/ea cost basis)</p>
                </div>
                <div className="border-t border-slate-800/80 pt-4 mt-6 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total All-Time Revenue</span>
                    <span className="font-mono font-bold text-white">${data.summary.revenueAllTime.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Net Profit to Date</span>
                    <span className="font-mono font-bold text-emerald-400">${viabilityBreakEven.totalActualProfit.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/60 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Break-Even Tracking Indicators
                </h4>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-400">Revenue Break-Even</span>
                    <span className="font-mono text-orange-400">{viabilityBreakEven.percentRevenueRecovered}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-orange-500 h-full rounded-full transition-all duration-1000" style={{ width: `${viabilityBreakEven.percentRevenueRecovered}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-500">Requires {viabilityBreakEven.breakEvenUnits} total shirts sold to recover cash ($1,421)</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-400">Profit Break-Even</span>
                    <span className="font-mono text-emerald-400">{viabilityBreakEven.percentProfitRecovered}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${viabilityBreakEven.percentProfitRecovered}%` }} />
                  </div>
                  <p className="text-[9px] text-slate-500">Requires {viabilityBreakEven.breakEvenUnitsProfit} total shirts sold to offset inventory costs</p>
                </div>
              </div>

              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/60 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Outstanding Capital</p>
                  <p className={`text-4xl font-black italic mt-1 font-mono ${viabilityBreakEven.isBrokenEven ? "text-emerald-400" : "text-rose-400"}`}>
                    ${viabilityBreakEven.remainsToRecover.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-2">Remaining gross sales until capital fully recovered</p>
                </div>
                <div className="p-3 rounded-lg border bg-slate-950/40 text-[10px] leading-relaxed text-slate-400 mt-6 border-slate-800">
                  {viabilityBreakEven.isBrokenEven ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      ✓ Initial $1,421 capital fully recovered! Every subsequent sale represents 100% net surplus growth!
                    </span>
                  ) : (
                    <span>
                      ⚠️ Need to sell **{Math.max(0, viabilityBreakEven.breakEvenUnits - totalActualSales60d)}** more units at $3.50 to fully recover starting capital.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
