'use client';

import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Download, 
  ChevronRight, 
  Warehouse,
  Flame,
  Snowflake,
  DollarSign,
  ArrowUpRight,
  Target,
  Sparkles,
  Zap,
  TrendingUp,
  AlertTriangle,
  X,
  PieChart,
  BarChart,
  ShieldAlert,
  Calendar,
  Layers,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  Button,
  Progress,
  Badge
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { 
  BarChart as ReBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ReTooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

// Client-side PDF helper
const generatePDF = async (data: any) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  
  const doc = new jsPDF() as any;
  const date = new Date().toLocaleDateString();
  const season = data.analysis.season || 'Current';

  // Header
  doc.setFillColor(2, 6, 23);
  doc.rect(0, 0, 210, 50, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('NIRVANA', 15, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(225, 29, 72);
  doc.text(`INTELLIGENCE ORDER DIRECTIVE [${season.toUpperCase()}]`, 15, 35);
  doc.setTextColor(100, 116, 139);
  doc.text(`GENERATED: ${date} | REF: STRAT-${Math.random().toString(36).substring(7).toUpperCase()}`, 15, 42);

  // Financials
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('I. FINANCIAL MATRIX', 15, 65);
  
  const summaryData = [
    ['CAPITAL REINVESTMENT BUDGET', `$${data.analysis.suggestedBudget.toLocaleString()}`],
    ['MONTHLY OVERHEAD RESERVE', `$${data.analysis.monthlyOverhead.toLocaleString()}`],
    ['CURRENT VAULT LIQUIDITY', `$${data.analysis.actualVaultBalance.toLocaleString()}`]
  ];

  (doc as any).autoTable({
    startY: 70,
    head: [['Strategic KPI', 'Value']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
    styles: { fontSize: 9 }
  });

  // Orders
  doc.text('II. DEPLOYMENT ORDERS', 15, (doc as any).lastAutoTable.finalY + 15);
  const orderData = data.recommendations
    .filter((r: any) => r.recommendation === 'order')
    .map((r: any) => [
      r.name,
      r.category,
      r.currentStock,
      `+${r.suggestedQty}`,
      `$${r.estimatedCost.toLocaleString()}`,
      r.priority.toUpperCase()
    ]);

  (doc as any).autoTable({
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Product', 'Sector', 'Base', 'Deployment', 'Unit Capital', 'Tier']],
    body: orderData,
    theme: 'striped',
    headStyles: { fillColor: [225, 29, 72] }
  });

  if (data.shipmentAnalysis?.length) {
    doc.text('III. SHIPMENT PERFORMANCE', 15, (doc as any).lastAutoTable.finalY + 15);
    const shipmentData = data.shipmentAnalysis.slice(0, 12).map((s: any) => [
      s.shipmentNumber,
      s.supplier,
      `${s.sellThrough.toFixed(0)}%`,
      `$${s.revenue.toLocaleString()}`,
      `$${s.grossProfit.toLocaleString()}`,
      `${s.roi.toFixed(0)}%`,
      s.status.toUpperCase()
    ]);

    (doc as any).autoTable({
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Shipment', 'Supplier', 'Sold', 'Revenue', 'Profit', 'ROI', 'Signal']],
      body: shipmentData,
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 8 }
    });
  }

  doc.save(`Nirvana_Order_${date.replace(/\//g, '-')}.pdf`);
};

const currency = (val: number) => `$${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StockIntelligencePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/intelligence/stock-brain');
      const json = await res.json();
      if (json.success) setData(json);
    } catch (e) {
      console.error('Failed to fetch stock brain data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepAnalysis = (item: any) => {
    setSelectedItem(item);
    setIsPanelOpen(true);
  };

  const handleFinalizeOrder = async () => {
    setGeneratingPdf(true);
    await generatePDF(data);
    setGeneratingPdf(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white p-6">
        <div className="relative">
          <div className="absolute inset-0 bg-rose-500/20 blur-[100px] rounded-full animate-pulse" />
          <Brain className="h-20 w-20 text-rose-500 animate-pulse relative z-10" />
        </div>
        <div className="mt-8 flex flex-col items-center gap-2">
          <p className="text-xs font-black uppercase tracking-[0.5em] text-slate-500">Initializing Intelligence</p>
          <div className="w-48 h-1 bg-slate-900 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 animate-[loading_2s_infinite]" />
          </div>
        </div>
      </div>
    );
  }

  const recommendations = data?.recommendations || [];
  const analysis = data?.analysis || {};
  const shipmentAnalysis = data?.shipmentAnalysis || [];

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-rose-500/30 overflow-x-hidden pb-20">
      {/* HUD Elements */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-rose-500/5 to-transparent" />
        <div className="absolute top-1/4 -right-1/4 w-[50%] h-[50%] bg-blue-600/5 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-1/4 -left-1/4 w-[50%] h-[50%] bg-rose-600/5 blur-[150px] rounded-full" />
      </div>

      <div className="max-w-[1600px] mx-auto p-4 md:p-10">
        {/* Command Header */}
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-16 relative">
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-rose-600 to-rose-400 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200" />
                <div className="relative h-20 w-20 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center">
                  <Brain className="h-10 w-10 text-rose-500" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-6xl font-black italic tracking-tighter text-white uppercase leading-none">Intelligence</h1>
                  <Badge className="bg-rose-500 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 animate-pulse">Live HUD</Badge>
                </div>
                <div className="flex items-center gap-4 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">
                  <span className="flex items-center gap-2"><Activity className="h-3 w-3 text-emerald-500" /> Systems Nominal</span>
                  <span className="h-1 w-1 bg-slate-800 rounded-full" />
                  <span>Cycle: {analysis.season} OPS v3.4</span>
                </div>
              </div>
            </div>
            <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-2xl border-l-2 border-rose-500/30 pl-6 italic">
              "{analysis.intelligenceInsight}"
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              onClick={fetchData} 
              variant="outline" 
              className="border-white/5 bg-white/5 backdrop-blur-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 h-14 px-8 rounded-2xl transition-all hover:-translate-y-1 active:scale-95 group"
            >
              <Zap className="h-4 w-4 mr-3 text-yellow-500 group-hover:animate-bounce" /> Sync Neural Matrix
            </Button>
            <Button 
              onClick={handleFinalizeOrder}
              disabled={generatingPdf}
              className="bg-white hover:bg-slate-200 text-black border-none text-[10px] font-black uppercase tracking-widest h-14 px-10 rounded-2xl shadow-[0_15px_30px_-5px_rgba(255,255,255,0.1)] transition-all hover:-translate-y-1 hover:shadow-white/10 active:scale-95"
            >
              {generatingPdf ? "Compiling Data..." : <><Download className="h-4 w-4 mr-3" /> Finalize Deployment</>}
            </Button>
          </div>
        </header>

        <main className="grid gap-10 lg:grid-cols-12">
          {/* Tactical Sidebar */}
          <section className="lg:col-span-3 space-y-8">
            {/* Capital Allocation Card */}
            <Card className="bg-white/[0.03] border-white/5 backdrop-blur-3xl rounded-[40px] overflow-hidden p-8 border-b-rose-500/50">
              <div className="flex justify-between items-start mb-10">
                <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20 text-rose-500">
                  <DollarSign className="h-6 w-6" />
                </div>
                <Badge variant="outline" className="border-slate-800 text-[9px] uppercase tracking-widest font-black text-slate-500">Capital Pool</Badge>
              </div>
              <div className="space-y-1 mb-8">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Available for Deployment</p>
                <h2 className="text-5xl font-black text-white font-mono tracking-tighter tabular-nums">
                  {currency(analysis.suggestedBudget)}
                </h2>
              </div>
              <div className="space-y-6">
                <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-slate-500">Risk Profile</span>
                    <span className="text-emerald-400">Stable</span>
                  </div>
                  <Progress value={40} className="h-2 bg-slate-900" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-3xl bg-white/[0.01] border border-white/5 text-center">
                    <p className="text-[8px] font-black text-slate-600 uppercase mb-1">Overhead</p>
                    <p className="text-xs font-black text-white">{currency(analysis.monthlyOverhead)}</p>
                  </div>
                  <div className="p-4 rounded-3xl bg-white/[0.01] border border-white/5 text-center">
                    <p className="text-[8px] font-black text-slate-600 uppercase mb-1">Reserves</p>
                    <p className="text-xs font-black text-white">{currency(analysis.actualVaultBalance)}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Logistics Strategy */}
            <Card className="bg-white/[0.02] border-white/5 backdrop-blur-3xl rounded-[40px] p-8">
              <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-3 mb-8">
                <Layers className="h-4 w-4 text-rose-500" /> Sector Allocation
              </h3>
              <div className="space-y-8">
                {data?.shopAllocations?.map((shop: any) => (
                  <div key={shop.shopId} className="group cursor-default">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="h-8 w-8 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-[10px] font-black text-white">
                        {shop.shopName.charAt(0)}
                      </div>
                      <p className="text-xs font-black text-white uppercase tracking-widest group-hover:text-rose-400 transition-colors">{shop.shopName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 pl-12">
                      {shop.needs.map((need: any, i: number) => (
                        <span key={i} className="px-3 py-1.5 bg-white/5 rounded-full text-[9px] font-bold text-slate-500 uppercase hover:bg-white/10 hover:text-slate-300 transition-all">
                          {need.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* Directives Engine */}
          <section className="lg:col-span-9 space-y-10">
            {shipmentAnalysis.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-6">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Shipment Performance</h2>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">
                      Cost recovery, sell-through, ROI, and stock pressure by shipment
                    </p>
                  </div>
                  <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-[9px] font-black uppercase tracking-widest">
                    {shipmentAnalysis.length} Batches
                  </Badge>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  {shipmentAnalysis.slice(0, 6).map((shipment: any) => {
                    const isPositive = shipment.grossProfit >= 0;
                    const urgency = shipment.daysLeft < 14 && shipment.currentUnits > 0;
                    return (
                      <div
                        key={shipment.id}
                        className={cn(
                          "rounded-[32px] border p-6 bg-white/[0.03] transition-all hover:bg-white/[0.05]",
                          shipment.status === 'winning' ? "border-emerald-500/20" :
                          shipment.status === 'margin-risk' ? "border-amber-500/25" :
                          shipment.status === 'slow' ? "border-rose-500/25" : "border-white/5"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center">
                                <Warehouse className="h-5 w-5 text-sky-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-black text-white tracking-tight">{shipment.shipmentNumber}</h3>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                  {shipment.supplier} • {shipment.itemCount} items
                                </p>
                              </div>
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              "border-none text-[8px] font-black uppercase tracking-widest",
                              shipment.status === 'winning' ? "bg-emerald-500/15 text-emerald-400" :
                              shipment.status === 'margin-risk' ? "bg-amber-500/15 text-amber-300" :
                              shipment.status === 'slow' ? "bg-rose-500/15 text-rose-400" :
                              "bg-slate-500/15 text-slate-400"
                            )}
                          >
                            {shipment.status.replace('-', ' ')}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                          <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Cost</p>
                            <p className="text-sm font-black text-white font-mono mt-1">{currency(shipment.costBasis)}</p>
                          </div>
                          <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Revenue</p>
                            <p className="text-sm font-black text-white font-mono mt-1">{currency(shipment.revenue)}</p>
                          </div>
                          <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Profit</p>
                            <p className={cn("text-sm font-black font-mono mt-1", isPositive ? "text-emerald-400" : "text-rose-400")}>
                              {currency(shipment.grossProfit)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-black/30 border border-white/5 p-4">
                            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">ROI</p>
                            <p className={cn("text-sm font-black font-mono mt-1", shipment.roi >= 0 ? "text-emerald-400" : "text-rose-400")}>
                              {shipment.roi.toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 space-y-4">
                          <div>
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-2">
                              <span className="text-slate-500">Sell-through</span>
                              <span className="text-slate-300">{shipment.soldUnits}/{shipment.originalUnits} units • {shipment.sellThrough.toFixed(0)}%</span>
                            </div>
                            <Progress value={Math.min(100, shipment.sellThrough)} className="h-2 bg-slate-950" />
                          </div>

                          <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                            <span className="px-3 py-1.5 rounded-full bg-white/5 text-slate-400">
                              Remaining: {shipment.currentUnits} units / {currency(shipment.remainingCost)}
                            </span>
                            <span className={cn("px-3 py-1.5 rounded-full", urgency ? "bg-rose-500/15 text-rose-400" : "bg-white/5 text-slate-400")}>
                              Cover: {shipment.daysLeft === 999 ? "No recent velocity" : `${shipment.daysLeft.toFixed(0)} days`}
                            </span>
                          </div>

                          {(shipment.fastestMover || shipment.slowestMover) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {shipment.fastestMover && (
                                <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Fastest mover</p>
                                  <p className="text-xs font-black text-white mt-1">{shipment.fastestMover.name}</p>
                                  <p className="text-[10px] text-slate-500 mt-1">{shipment.fastestMover.sellThrough.toFixed(0)}% sold</p>
                                </div>
                              )}
                              {shipment.slowestMover && (
                                <div className="rounded-2xl bg-rose-500/5 border border-rose-500/10 p-4">
                                  <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Slowest mover</p>
                                  <p className="text-xs font-black text-white mt-1">{shipment.slowestMover.name}</p>
                                  <p className="text-[10px] text-slate-500 mt-1">{shipment.slowestMover.sellThrough.toFixed(0)}% sold</p>
                                </div>
                              )}
                            </div>
                          )}

                          {shipment.flags.length > 0 && (
                            <div className="rounded-2xl bg-slate-950/70 border border-white/5 p-4 space-y-2">
                              {shipment.flags.map((flag: string, index: number) => (
                                <p key={index} className="text-[10px] text-slate-400 leading-relaxed flex gap-2">
                                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400 flex-none" />
                                  {flag}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-white/5 pb-6">
              <div className="flex items-center gap-10">
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Deployment Orders</h2>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.8)]" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority One</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hold/Monitor</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                Showing {recommendations.length} Scoped Units
              </div>
            </div>

            <div className="grid gap-6">
              {recommendations.map((rec: any, idx: number) => (
                <div 
                  key={idx} 
                  className={cn(
                    "group relative rounded-[40px] border p-8 transition-all duration-700",
                    rec.recommendation === 'order' 
                      ? "bg-white/[0.04] border-white/10 hover:bg-white/[0.06] hover:border-emerald-500/30" 
                      : "bg-black/40 border-white/5 opacity-50 hover:opacity-100"
                  )}
                >
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-12">
                    <div className="flex-1 space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-6">
                          <div className={cn(
                            "h-16 w-16 rounded-[24px] flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-2xl",
                            rec.recommendation === 'order' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-slate-900 text-slate-600 border border-white/5"
                          )}>
                            {rec.recommendation === 'order' ? <TrendingUp className="h-8 w-8" /> : <Snowflake className="h-8 w-8" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="text-2xl font-black text-white tracking-tight">{rec.name}</h3>
                              {rec.priority === 'high' && <Badge className="bg-rose-500/10 text-rose-500 border-none text-[8px] font-black uppercase px-2 py-0 h-4">Tier 1</Badge>}
                            </div>
                            <div className="flex items-center gap-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              <span className="text-rose-400/80">{rec.category}</span>
                              <span className="h-1 w-1 bg-slate-800 rounded-full" />
                              <span>Last Active: {new Date(rec.lastSold).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          onClick={() => handleDeepAnalysis(rec)}
                          className="h-10 px-6 rounded-2xl bg-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-rose-500 transition-all"
                        >
                          Deep Matrix <ChevronRight className="h-3 w-3 ml-2" />
                        </Button>
                      </div>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xl group-hover:text-slate-300 transition-colors">
                        {rec.reason}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-12 xl:w-[500px]">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Base Stock</p>
                        <p className="text-xl font-black text-white font-mono">{rec.currentStock}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">90D Gross</p>
                        <p className="text-xl font-black text-emerald-500 font-mono tracking-tighter">+{currency(rec.profit)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Deployment</p>
                        <p className={cn(
                          "text-3xl font-black font-mono leading-none tracking-tighter transition-all group-hover:scale-110 origin-left",
                          rec.suggestedQty > 0 ? "text-white" : "text-slate-800"
                        )}>
                          {rec.suggestedQty > 0 ? `+${rec.suggestedQty}` : '00'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Est. Capital</p>
                        <p className="text-xl font-black text-white font-mono tracking-tighter">{currency(rec.estimatedCost)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Matrix Telemetry */}
                  <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between opacity-40 group-hover:opacity-100 transition-all duration-500">
                    <div className="flex gap-10 items-center">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Velocity: {(rec.velocity * 7).toFixed(1)} Units/WK</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">E-DAY: {rec.daysLeft === 999 ? 'PERPETUAL' : `${rec.daysLeft.toFixed(0)} DAYS REMAINING`}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                      Verified by Neural Sync
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* Deep Analysis Side Panel */}
      {isPanelOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-md" onClick={() => setIsPanelOpen(false)} />
          <aside className="relative w-full max-w-2xl h-full bg-[#020617] border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] p-10 overflow-y-auto animate-in slide-in-from-right duration-500">
            <button onClick={() => setIsPanelOpen(false)} className="absolute top-8 right-8 p-2 text-slate-500 hover:text-white transition-colors">
              <X className="h-6 w-6" />
            </button>
            
            <div className="space-y-12">
              <header className="space-y-4">
                <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px] font-black uppercase tracking-widest">Neural Deep Matrix</Badge>
                <h2 className="text-5xl font-black text-white tracking-tighter">{selectedItem.name}</h2>
                <div className="flex gap-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <span className="flex items-center gap-2"><Warehouse className="h-3 w-3" /> {selectedItem.category}</span>
                  <span className="flex items-center gap-2"><Activity className="h-3 w-3" /> Risk: Low</span>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-6">
                <div className="p-8 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-2">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Historical Yield</p>
                  <p className="text-3xl font-black text-emerald-500 font-mono tracking-tighter">{currency(selectedItem.profit)}</p>
                </div>
                <div className="p-8 rounded-[32px] bg-white/[0.03] border border-white/5 space-y-2">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Sales Volume (90D)</p>
                  <p className="text-3xl font-black text-white font-mono tracking-tighter">{selectedItem.qtySold90d} Units</p>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-rose-500" /> Velocity Breakdown
                </h3>
                <div className="h-64 w-full bg-white/[0.01] border border-white/5 rounded-[32px] p-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <ReBarChart data={[
                      { name: 'Last 90D', value: selectedItem.qtySold90d },
                      { name: 'Last 30D', value: selectedItem.qtySold30d },
                      { name: 'Avg Daily', value: selectedItem.velocity.toFixed(2) }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} axisLine={false} tickLine={false} />
                      <ReTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px'}} />
                      <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={40}>
                        { [0,1,2].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === 1 ? '#e11d48' : '#334155'} />
                        ))}
                      </Bar>
                    </ReBarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-10 rounded-[40px] bg-gradient-to-br from-rose-500/10 to-transparent border border-rose-500/20 space-y-6">
                <h4 className="text-sm font-black text-white uppercase tracking-widest">Autonomous Strategy</h4>
                <p className="text-sm text-slate-400 leading-relaxed italic">
                  "Based on current market velocity and {selectedItem.daysLeft.toFixed(0)} day exhaustion timeline, our neural model recommends a 
                  deployment of {selectedItem.suggestedQty} units to capture peak seasonal demand while maintaining capital efficiency."
                </p>
                <div className="flex gap-4">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-none">High Yield</Badge>
                  <Badge className="bg-sky-500/20 text-sky-400 border-none">Secure Asset</Badge>
                </div>
              </div>

              <Button 
                onClick={() => setIsPanelOpen(false)}
                className="w-full bg-white text-black h-16 rounded-3xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Return to Command
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
