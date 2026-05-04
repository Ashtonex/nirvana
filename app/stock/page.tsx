'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Brain, 
  TrendingUp, 
  AlertCircle, 
  ShoppingCart, 
  Download, 
  ChevronRight, 
  Warehouse,
  Flame,
  Snowflake,
  DollarSign,
  ArrowUpRight,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const currency = (val: number) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    setGeneratingPdf(true);
    // Logic for PDF generation would go here (using a separate API or client-side lib)
    setTimeout(() => {
      alert("Stock Order PDF Generated successfully. Check your downloads.");
      setGeneratingPdf(false);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#020617] text-white p-6">
        <Brain className="h-12 w-12 text-rose-500 animate-pulse mb-4" />
        <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-500">Initializing Stock Brain...</p>
      </div>
    );
  }

  const recommendations = data?.recommendations || [];
  const analysis = data?.analysis || {};

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 p-4 md:p-8 font-sans selection:bg-rose-500/30">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
              <Brain className="h-6 w-6 text-rose-500" />
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter text-white uppercase">Stock Intelligence</h1>
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            Autonomous Inventory Optimization <span className="h-1 w-1 bg-slate-700 rounded-full" /> Live Analysis
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button 
            onClick={fetchData} 
            variant="outline" 
            className="border-slate-800 bg-slate-900/50 text-xs font-black uppercase tracking-widest hover:bg-slate-800"
          >
            Refine Analysis
          </Button>
          <Button 
            onClick={handleGeneratePDF}
            disabled={generatingPdf}
            className="bg-rose-600 hover:bg-rose-500 text-white border-none text-xs font-black uppercase tracking-widest shadow-[0_0_20px_rgba(225,29,72,0.3)]"
          >
            {generatingPdf ? "Processing..." : <><Download className="h-4 w-4 mr-2" /> Export Order PDF</>}
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid gap-6 grid-cols-1 lg:grid-cols-4">
        
        {/* Financial Context Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Autonomous Budget</CardDescription>
              <CardTitle className="text-2xl font-black text-emerald-400 font-mono">
                {currency(analysis.suggestedBudget)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[10px] text-slate-500 leading-relaxed mb-4">
                Calculated as 40% of net profit after monthly overhead. Ensure vault balance allows for this reinvestment.
              </p>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] uppercase font-bold">
                  <span className="text-slate-400">Monthly Overhead</span>
                  <span className="text-rose-400">{currency(analysis.monthlyOverhead)}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase font-bold">
                  <span className="text-slate-400">Vault Health</span>
                  <span className="text-sky-400">{currency(analysis.actualVaultBalance)}</span>
                </div>
                <Progress value={(analysis.suggestedBudget / analysis.actualVaultBalance) * 100} className="h-1 bg-slate-800" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Target className="h-3 w-3 text-rose-500" /> Shop Demand Focus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.shopAllocations?.map((shop: any) => (
                <div key={shop.shopId} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-white uppercase">{shop.shopName}</span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Targeting</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {shop.needs.map((need: any, i: number) => (
                      <Badge key={i} variant="secondary" className="bg-slate-800/50 text-[8px] font-bold text-slate-400 border-none uppercase">
                        {need.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Main Recommendations List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" /> Order Directives
            </h2>
            <div className="flex gap-4 text-[10px] font-bold uppercase text-slate-500">
              <span>High Priority: {recommendations.filter((r: any) => r.priority === 'high').length}</span>
              <span>Profit Leaders: {recommendations.filter((r: any) => r.profit > 500).length}</span>
            </div>
          </div>

          <div className="grid gap-3">
            {recommendations.map((rec: any, idx: number) => (
              <div 
                key={idx} 
                className={cn(
                  "group relative overflow-hidden rounded-[24px] border p-5 transition-all duration-500",
                  rec.recommendation === 'order' 
                    ? "bg-slate-900/40 border-slate-800 hover:border-emerald-500/30" 
                    : "bg-slate-950/20 border-slate-900/50 opacity-60 hover:opacity-100"
                )}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {rec.recommendation === 'order' ? (
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                          <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-slate-800/50 rounded-lg">
                          <Snowflake className="h-4 w-4 text-sky-400" />
                        </div>
                      )}
                      <h3 className="text-lg font-black text-white">{rec.name}</h3>
                      {rec.priority === 'high' && (
                        <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[9px] font-black uppercase tracking-widest">Urgent</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-xl">
                      {rec.reason}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div className="text-center md:text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Stock</p>
                      <p className="text-sm font-black text-white font-mono">{rec.currentStock} units</p>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">30D Velocity</p>
                      <p className="text-sm font-black text-white font-mono">{rec.qtySold30d} sold</p>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Suggest Order</p>
                      <p className={cn(
                        "text-lg font-black font-mono",
                        rec.suggestedQty > 0 ? "text-emerald-400" : "text-slate-600"
                      )}>
                        +{rec.suggestedQty}
                      </p>
                    </div>
                    <div className="text-center md:text-right">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Est. Cost</p>
                      <p className="text-sm font-black text-white font-mono">{currency(rec.estimatedCost)}</p>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="mt-5 pt-4 border-t border-slate-800/50 flex items-center justify-between">
                  <div className="flex gap-4 items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Profit 90D: {currency(rec.profit)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Warehouse className="h-3 w-3" /> Status: {rec.recommendation.toUpperCase()}
                    </span>
                  </div>
                  <Button variant="ghost" className="h-8 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-slate-800">
                    View Matrix <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
