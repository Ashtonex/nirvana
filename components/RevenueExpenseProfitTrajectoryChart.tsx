"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from "recharts";
import { BarChart3, AlertCircle, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

interface RevenueExpenseProfitTrajectoryChartProps {
  datasets: Record<string, any[]>;
}

export function RevenueExpenseProfitTrajectoryChart({ datasets }: RevenueExpenseProfitTrajectoryChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Card className="col-span-4 border-sky-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-emerald-400" /> Revenue vs Expenses vs Profit (Daily)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            Loading chart...
          </div>
        </CardContent>
      </Card>
    );
  }

  const globalData = datasets?.global || [];
  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  if (!globalData || globalData.length === 0) {
    return (
      <Card className="col-span-4 border-sky-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-emerald-400" /> Revenue vs Expenses vs Profit (Daily)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const lastData = globalData.filter(d => d.revenue !== null).slice(-1)[0];
  const todayData = globalData.find(d => d.day === new Date().getDate());
  
  const totalRevenue = lastData?.revenue || 0;
  const totalExpenses = lastData?.expenses || 0;
  const totalProfit = lastData?.profit || 0;
  const todayRevenue = todayData?.revenue || 0;
  const todayExpenses = todayData?.variableExpenses || 0;
  const todayProfit = (todayRevenue || 0) - (todayExpenses || 0);

  return (
    <Card className="col-span-full border-emerald-500/20 bg-slate-900/50 backdrop-blur-md">
      <CardHeader className="pb-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase italic">
            <BarChart3 className="text-emerald-400" /> Revenue vs Expenses vs Profit (Daily)
          </CardTitle>
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {currentMonth} | All Shops Combined | Daily Tracking
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {!globalData || globalData.length === 0 ? (
          <div className="w-full h-[380px] mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50">
            <AlertCircle className="h-12 w-12 text-slate-500 mb-3" />
            <p className="text-slate-400 font-medium">No data available</p>
          </div>
        ) : (
          <div className="w-full min-h-[380px]">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={globalData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "12px",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}
                  formatter={(val: any) => [`$${(Number(val || 0)).toLocaleString()}`]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: "10px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.05em" }}
                />
                <Line name="Cumulative Expenses" type="monotone" dataKey="expenses" stroke="#f97316" strokeWidth={3} dot={false} />
                <Line name="Cumulative Revenue" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={4} dot={{ r: 3 }} connectNulls={false} />
                <Line name="Cumulative Profit" type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>

      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Monthly Revenue</p>
            <p className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              ${totalRevenue.toLocaleString()}
            </p>
            <p className="text-[9px] text-emerald-400/60 mt-1">Kipasa + Dub Dub + TC</p>
          </div>
          
          <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">Monthly Expenses</p>
            <p className="text-2xl font-bold text-orange-400 flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              ${totalExpenses.toLocaleString()}
            </p>
            <p className="text-[9px] text-orange-400/60 mt-1">All POS Expenses</p>
          </div>
          
          <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-1">Monthly Profit</p>
            <p className={`text-2xl font-bold flex items-center gap-2 ${totalProfit >= 0 ? 'text-sky-400' : 'text-rose-400'}`}>
              <DollarSign className={`h-5 w-5 ${totalProfit >= 0 ? 'text-sky-400' : 'text-rose-400'}`} />
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toLocaleString()}
            </p>
            <p className="text-[9px] text-sky-400/60 mt-1">Revenue - Expenses</p>
          </div>
          
          <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Today</p>
            <p className={`text-2xl font-bold ${todayProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {todayProfit >= 0 ? '+' : ''}${todayProfit.toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-400/60 mt-1">Today's Net</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
