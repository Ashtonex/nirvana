"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Target, TrendingUp, DollarSign } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui";

interface BreakEvenChartProps {
    datasets: Record<string, any[]>; // global, kipasa, dubdub, tradecenter
}

export function BreakEvenChart({ datasets }: BreakEvenChartProps) {
    const [activeTab, setActiveTab] = useState("global");
    const data = datasets[activeTab] || [];

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
                        <TabsTrigger value="global" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3">Global</TabsTrigger>
                        <TabsTrigger value="kipasa" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3">Kipasa</TabsTrigger>
                        <TabsTrigger value="dubdub" className="data-[state=active]:bg-sky-600 data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3">DubDub</TabsTrigger>
                        <TabsTrigger value="tradecenter" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white uppercase text-[10px] font-black italic tracking-widest px-3">TC</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Target Monthly</p>
                        <p className="text-xl font-bold text-slate-100 flex items-center gap-2">
                            <TrendingUp className="text-blue-500 h-4 w-4" />
                            ${(data[data.length - 1]?.overhead || 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Current Sales</p>
                        <p className="text-xl font-bold text-blue-400">
                            ${(data.filter(d => d.sales !== null).slice(-1)[0]?.sales || 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Status</p>
                        {(() => {
                            const lastData = data.filter(d => d.sales !== null).slice(-1)[0];
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
