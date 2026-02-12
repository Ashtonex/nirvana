"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from "lucide-react";

interface SalesChartProps {
    data: {
        date: string;
        revenue: number;
        profit: number;
    }[];
    forecast?: {
        trend: 'up' | 'down' | 'flat';
        projectedNext30: number;
        confidence: number;
    };
}

export function SalesChart({ data, forecast }: SalesChartProps) {
    return (
        <Card className="col-span-4 border-violet-500/20 bg-slate-900/50">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="text-emerald-400" />
                            Revenue Trajectory
                        </CardTitle>
                        <CardDescription>30-Day Performance Overview</CardDescription>
                    </div>
                    {forecast && (
                        <div className="text-right">
                            <div className="text-xs text-slate-400">Next 30 Days (Projected)</div>
                            <div className="text-xl font-bold text-violet-400">
                                ${forecast.projectedNext30.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-slate-500">
                                {forecast.confidence > 0.5 ? 'High Confidence' : 'Low Confidence'} ({Math.round(forecast.confidence * 100)}%)
                            </div>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="w-full mt-4" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                stroke="#475569"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#475569"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${value}`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc" }}
                                itemStyle={{ color: "#8b5cf6" }}
                                formatter={(value: number | undefined) => [`$${(value || 0).toLocaleString()}`, "Revenue"]}
                            />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="#8b5cf6"
                                fillOpacity={1}
                                fill="url(#colorRevenue)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
