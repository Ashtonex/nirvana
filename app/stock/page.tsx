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
  AlertTriangle
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
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const currency = (val: number) => `$${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function StockIntelligencePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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

  const handleGeneratePDF = async () => {
    if (!data) return;
    setGeneratingPdf(true);
    
    try {
      const doc = new jsPDF() as any;
      const date = new Date().toLocaleDateString();
      const season = data.analysis.season || 'Current';

      // Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('NIRVANA STOCK INTELLIGENCE', 15, 20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`OFFICIAL ORDER DIRECTIVE | ${date} | SEASON: ${season.toUpperCase()}`, 15, 30);

      // Financial Context
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text('Financial Summary (30D Window)', 15, 50);
      
      const summaryData = [
        ['Suggested Reinvestment Budget', currency(data.analysis.suggestedBudget)],
        ['Monthly Overhead Target', currency(data.analysis.monthlyOverhead)],
        ['Projected Net Profit', currency(data.analysis.projectedNet)],
        ['Current Vault Health', currency(data.analysis.actualVaultBalance)]
      ];

      doc.autoTable({
        startY: 55,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [225, 29, 72] }
      });

      // Stock Recommendations
      doc.text('Automated Order Recommendations', 15, doc.lastAutoTable.finalY + 15);
      
      const orderData = data.recommendations
        .filter((r: any) => r.recommendation === 'order')
        .map((r: any) => [
          r.name,
          r.category,
          r.currentStock,
          `+${r.suggestedQty}`,
          currency(r.estimatedCost),
          r.priority.toUpperCase()
        ]);

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Product', 'Category', 'Stock', 'Order Qty', 'Est. Cost', 'Priority']],
        body: orderData,
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] }
      });

      // Shop Allocation plan
      doc.text('Suggested Shop Allocation', 15, doc.lastAutoTable.finalY + 15);
      
      const allocationData = data.shopAllocations.map((shop: any) => [
        shop.shopName,
        shop.needs.map((n: any) => n.name).join(', ')
      ]);

      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Shop', 'Primary Demand Focus']],
        body: allocationData,
        theme: 'plain'
      });

      doc.save(`Nirvana_Stock_Order_${date.replace(/\//g, '-')}.pdf`);
    } catch (e) {
      console.error('PDF Generation failed:', e);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white p-6">
        <div className="relative">
          <Brain className="h-16 w-16 text-rose-500 animate-pulse mb-4" />
          <div className="absolute inset-0 bg-rose-500/20 blur-2xl rounded-full" />
        </div>
        <p className="text-sm font-black uppercase tracking-[0.4em] text-rose-500/70 animate-bounce">Neural Sync Active</p>
      </div>
    );
  }

  const recommendations = data?.recommendations || [];
  const analysis = data?.analysis || {};

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-4 md:p-8 font-sans selection:bg-rose-500/30 overflow-x-hidden">
      {/* Background Orbs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-rose-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="h-14 w-14 bg-gradient-to-br from-rose-500 to-rose-700 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(225,29,72,0.4)]">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-5xl font-black italic tracking-tighter text-white uppercase leading-none">Stock Brain</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px] font-black uppercase tracking-widest px-2 py-0">Autonomous Mode</Badge>
                  <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">{analysis.season} CYCLE v2.0</span>
                </div>
              </div>
            </div>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest max-w-lg">
              {analysis.intelligenceInsight}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              onClick={fetchData} 
              variant="outline" 
              className="border-slate-800 bg-slate-900/50 text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 h-12 px-6 rounded-xl transition-all hover:scale-105"
            >
              <Zap className="h-4 w-4 mr-2 text-yellow-500" /> Re-Analyze
            </Button>
            <Button 
              onClick={handleGeneratePDF}
              disabled={generatingPdf}
              className="bg-white hover:bg-slate-100 text-black border-none text-[10px] font-black uppercase tracking-widest h-12 px-8 rounded-xl shadow-[0_20px_40px_-10px_rgba(255,255,255,0.2)] transition-all hover:scale-105"
            >
              {generatingPdf ? "Compiling PDF..." : <><Download className="h-4 w-4 mr-2" /> Download Order Sheet</>}
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          {/* Dashboard Left */}
          <div className="lg:col-span-4 space-y-6">
            {/* Budget Card */}
            <Card className="bg-white/[0.03] border-white/5 backdrop-blur-3xl rounded-[32px] overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign className="h-24 w-24 text-white" />
              </div>
              <CardHeader>
                <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Autonomous Spend Capacity</CardDescription>
                <CardTitle className="text-5xl font-black text-white font-mono tracking-tighter">
                  {currency(analysis.suggestedBudget)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                      <span className="text-slate-500">Capital Reinvestment</span>
                      <span className="text-emerald-400">40% of Net</span>
                    </div>
                    <Progress value={40} className="h-1.5 bg-slate-800" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-rose-500/5 border border-rose-500/10">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Overhead Block</p>
                      <p className="text-sm font-black text-rose-400">{currency(analysis.monthlyOverhead)}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-sky-500/5 border border-sky-500/10">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vault Reserve</p>
                      <p className="text-sm font-black text-sky-400">{currency(analysis.actualVaultBalance)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Shop Needs */}
            <Card className="bg-white/[0.02] border-white/5 backdrop-blur-3xl rounded-[32px]">
              <CardHeader>
                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                  <Target className="h-4 w-4 text-rose-500" /> Allocation Matrix
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {data?.shopAllocations?.map((shop: any) => (
                  <div key={shop.shopId} className="relative pl-6 border-l-2 border-slate-800 py-1">
                    <div className="absolute -left-[7px] top-2 h-3 w-3 rounded-full bg-slate-800 border-2 border-[#020617]" />
                    <p className="text-xs font-black text-white uppercase tracking-widest mb-2">{shop.shopName}</p>
                    <div className="flex flex-wrap gap-2">
                      {shop.needs.map((need: any, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white/5 rounded-lg text-[9px] font-bold text-slate-400 uppercase">
                          {need.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Directives Main */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-rose-500" /> Automated Directives
              </h2>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">High Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profitable</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {recommendations.map((rec: any, idx: number) => (
                <div 
                  key={idx} 
                  className={cn(
                    "group relative rounded-[32px] border p-6 transition-all duration-500",
                    rec.recommendation === 'order' 
                      ? "bg-white/[0.04] border-white/5 hover:border-emerald-500/20" 
                      : "bg-black/20 border-white/5 opacity-60 hover:opacity-100"
                  )}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                          rec.recommendation === 'order' ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-500"
                        )}>
                          {rec.recommendation === 'order' ? <TrendingUp className="h-5 w-5" /> : <Snowflake className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white tracking-tight">{rec.name}</h3>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{rec.category}</p>
                        </div>
                        {rec.priority === 'high' && (
                          <Badge className="bg-rose-500/10 text-rose-500 border-none text-[8px] font-black uppercase px-2 py-0">Urgent</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-lg">
                        {rec.reason}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-10">
                      <div className="text-left lg:text-right">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Current Stock</p>
                        <p className="text-sm font-black text-white font-mono">{rec.currentStock} units</p>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">90D Profit</p>
                        <p className="text-sm font-black text-emerald-400 font-mono">+{currency(rec.profit)}</p>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1">Order Suggestion</p>
                        <p className={cn(
                          "text-2xl font-black font-mono leading-none",
                          rec.suggestedQty > 0 ? "text-white" : "text-slate-700"
                        )}>
                          {rec.suggestedQty > 0 ? `+${rec.suggestedQty}` : '0'}
                        </p>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimate</p>
                        <p className="text-sm font-black text-white font-mono">{currency(rec.estimatedCost)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Matrix Detail */}
                  <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-6 items-center">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Velocity: {(rec.velocity * 7).toFixed(1)}/week</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">E-Day: {rec.daysLeft === 999 ? '∞' : `${rec.daysLeft.toFixed(0)} days`}</span>
                      </div>
                    </div>
                    <Button variant="ghost" className="h-6 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white p-0">
                      Deep Analysis <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
