"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Target, TrendingUp, DollarSign, AlertCircle } from "lucide-react";

interface BreakEvenChartProps {
    datasets: Record<string, any[]>;
}

export function BreakEvenChart({ datasets }: BreakEvenChartProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <Card className="col-span-3 border-emerald-500/20 bg-slate-900/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="text-emerald-400" />
                        Break-Even Analysis
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

    if (!globalData || globalData.length === 0) {
        return (
            <Card className="col-span-3 border-emerald-500/20 bg-slate-900/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="text-emerald-400" />
                        Break-Even Analysis
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

    const lastData = globalData.filter(d => d.sales !== null).slice(-1)[0];
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
        <Card className="col-span-full border-blue-500/20 bg-slate-900/50 backdrop-blur-md">
            <CardHeader className="pb-6">
                <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-black uppercase italic">
                        <Target className="text-blue-500 animate-pulse" /> Profit Path & Break-Even Trajectory
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {currentMonth} | Kipasa + Dub Dub + Trade Center Combined
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                {!globalData || globalData.length === 0 ? (
                    <div className="w-full h-[400px] mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50">
                        <AlertCircle className="h-12 w-12 text-slate-500 mb-3" />
                        <p className="text-slate-400 font-medium">No data available</p>
                        <p className="text-slate-500 text-sm mt-1">Sales will appear here once transactions are recorded</p>
                    </div>
                ) : (
                    <div className="w-full min-h-[400px]">
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={globalData} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="day"
                                    stroke="#475569"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    label={{ value: 'Day of Month', position: 'insideBottom', offset: -5, fill: '#475569', fontSize: 10, fontWeight: 'bold' }}
                                />
                                <YAxis
                                    stroke="#475569"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                                    labelStyle={{ color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}
                                    formatter={(val: any) => [`$${(val || 0).toLocaleString()}`]}
                                />
                                <Legend
                                    verticalAlign="top"
                                    align="right"
                                    height={36}
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                />
                                <Line
                                    name="Monthly Overhead (Max $4,900)"
                                    type="monotone"
                                    dataKey="overhead"
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                                <Line
                                    name="Cumulative Sales (All Shops)"
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="#3b82f6"
                                    strokeWidth={4}
                                    dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#0f172a" }}
                                    activeDot={{ r: 6 }}
                                />
                                <Line
                                    name="Net Profit"
                                    type="monotone"
                                    dataKey="profit"
                                    stroke="#10b981"
                                    strokeWidth={4}
                                    dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#0f172a" }}
                                    activeDot={{ r: 6 }}
                                    connectNulls={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Monthly Overhead Target</p>
                        <p className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <TrendingUp className="text-blue-500 h-4 w-4" />
                            $4,900
                        </p>
                        <p className="text-[9px] text-slate-600 mt-1">Cap Maximum</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Current Sales</p>
                        <p className="text-xl font-bold text-blue-400 flex items-center gap-2">
                            <DollarSign className="text-blue-500 h-4 w-4" />
                            ${(lastData?.sales || 0).toLocaleString()}
                        </p>
                        <p className="text-[9px] text-slate-600 mt-1">Kipasa + Dub Dub + TC</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Overhead to Date</p>
                        <p className="text-xl font-bold text-slate-400">
                            ${(lastData?.overhead || 0).toLocaleString()}
                        </p>
                        <p className="text-[9px] text-slate-600 mt-1">Pro-rated ($4,900/mo)</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Status</p>
                        {(() => {
                            const isProfitable = (lastData?.sales || 0) > (lastData?.overhead || 0);
                            return (
                                <p className={`text-xl font-bold italic uppercase ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isProfitable ? 'Profit Mode' : 'Building Up'}
                                </p>
                            );
                        })()}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
