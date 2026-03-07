"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Target, TrendingUp, DollarSign, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";

interface BreakEvenChartProps {
    datasets: Record<string, any[]>; // global, kipasa, dubdub, tradecenter
}

export function BreakEvenChart({ datasets }: BreakEvenChartProps) {
    // Get available shops from datasets
    const availableShops = Object.keys(datasets || {}).sort((a, b) => {
        // Always put 'global' first
        if (a === 'global') return -1;
        if (b === 'global') return 1;
        return a.localeCompare(b);
    });

    const [activeTab, setActiveTab] = useState(availableShops[0] || "global");
    const data = datasets[activeTab] || [];
    
    // Get shop display name
    const getShopDisplayName = (key: string) => {
        const nameMap: Record<string, string> = {
            'global': 'Global',
            'kipasa': 'Kipasa',
            'dubdub': 'DubDub',
            'tradecenter': 'Trade Center'
        };
        return nameMap[key] || key;
    };

    return (
        <Card className="col-span-full border-blue-500/20 bg-slate-900/50 backdrop-blur-md">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 pb-6">
                <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-black uppercase italic">
                        <Target className="text-blue-500 animate-pulse" /> Profit Path & Break-Even Trajectory
                    </CardTitle>
                    <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Cumulative Sales vs. Daily Distributed Overheads
                    </CardDescription>
                </div>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-slate-950/50 p-1 rounded-xl border border-slate-800">
                    <TabsList className="bg-transparent border-0 h-9">
                        {availableShops.map((shop) => {
                            const colors: Record<string, string> = {
                                'global': 'data-[state=active]:bg-blue-600',
                                'kipasa': 'data-[state=active]:bg-emerald-600',
                                'dubdub': 'data-[state=active]:bg-sky-600',
                                'tradecenter': 'data-[state=active]:bg-amber-600'
                            };
                            return (
                                <TabsTrigger 
                                    key={shop}
                                    value={shop} 
                                    className={`${colors[shop] || 'data-[state=active]:bg-indigo-600'} data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3`}
                                >
                                    {getShopDisplayName(shop)}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
                {!data || data.length === 0 ? (
                    <div className="w-full h-[400px] mt-2 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50">
                        <AlertCircle className="h-12 w-12 text-slate-500 mb-3" />
                        <p className="text-slate-400 font-medium">No data available for {getShopDisplayName(activeTab)}</p>
                        <p className="text-slate-500 text-sm mt-1">Sales will appear here once transactions are recorded</p>
                    </div>
                ) : (
                    <div className="w-full h-[400px] mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
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
                                    name="Cumulative Overheads"
                                    type="monotone"
                                    dataKey="overhead"
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                                <Line
                                    name="Cumulative Sales"
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Target Monthly</p>
                        <p className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <TrendingUp className="text-blue-500 h-4 w-4" />
                            ${(data && data.length > 0 ? data[data.length - 1]?.overhead || 0 : 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Current Sales</p>
                        <p className="text-xl font-bold text-blue-400">
                            ${(data && data.length > 0 ? data.filter(d => d.sales !== null).slice(-1)[0]?.sales || 0 : 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Status</p>
                        {(() => {
                            const lastData = data && data.length > 0 ? data.filter(d => d.sales !== null).slice(-1)[0] : undefined;
                            const isProfitable = lastData?.sales > lastData?.overhead;
                            return (
                                <p className={`text-xl font-bold italic uppercase ${isProfitable ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {isProfitable ? 'Profit Mode' : 'Lean Mode'}
                                </p>
                            );
                        })()}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
