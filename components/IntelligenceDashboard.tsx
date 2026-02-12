"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { TrendingUp, TrendingDown, Award, AlertCircle, ShoppingCart, Skull } from "lucide-react";

interface IntelligenceDashboardProps {
    bestSellers: {
        itemId: string;
        itemName: string;
        totalQuantity: number;
        totalRevenue: number;
        grossMargin: number;
    }[];
    trends: {
        currentPeriodRevenue: number;
        previousPeriodRevenue: number;
        growth: number;
    };
    reorderSuggestions: {
        itemId: string;
        itemName: string;
        currentStock: number;
        daysToZero: number;
        suggestedReorder: number;
    }[];
    deadStock: {
        itemId: string;
        itemName: string;
        quantity: number;
        value: number;
        daysInStock: number;
    }[];
}

export function IntelligenceDashboard({ bestSellers, trends, reorderSuggestions, deadStock }: IntelligenceDashboardProps) {
    const isGrowthPositive = trends.growth >= 0;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                {/* TRENDS CARD */}
                <Card className="border-l-4 border-l-primary">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {isGrowthPositive ? <TrendingUp className="text-emerald-400" /> : <TrendingDown className="text-rose-400" />}
                            Performance Pulse
                        </CardTitle>
                        <CardDescription>30-Day Revenue Trend</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                            {trends.growth.toFixed(1)}%
                            <span className="text-sm font-normal text-slate-400 ml-2">
                                vs previous 30 days
                            </span>
                        </div>
                        <p className="text-sm text-slate-400 mt-2">
                            Current: <span className="text-foreground">${trends.currentPeriodRevenue.toLocaleString()}</span> •
                            Previous: <span className="text-foreground">${trends.previousPeriodRevenue.toLocaleString()}</span>
                        </p>
                    </CardContent>
                </Card>

                {/* INSIGHTS CARD */}
                <Card className="border-l-4 border-l-violet-500">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="text-violet-400" />
                            Strategic Insight
                        </CardTitle>
                        <CardDescription>System generated advice</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {reorderSuggestions.length > 0 ? (
                            <p className="text-sm">
                                <span className="text-rose-400 font-bold">Action Required:</span> You have {reorderSuggestions.length} items approaching stockout.
                                Review the "Smart Reorder" list below immediately.
                            </p>
                        ) : isGrowthPositive ? (
                            <p className="text-sm">
                                Revenue is trending up! Consider increasing stock for your top performer,
                                <span className="font-bold text-primary"> {bestSellers[0]?.itemName || "Unknown"}</span>,
                                to maintain momentum.
                            </p>
                        ) : (
                            <p className="text-sm">
                                Revenue is softening. Review pricing or run a promotion on
                                <span className="font-bold text-primary"> {bestSellers[0]?.itemName || "current stock"} </span>
                                to clear inventory.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {/* BEST SELLERS */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Award className="text-amber-400 h-5 w-5" />
                            Top Performers
                        </CardTitle>
                        <CardDescription>Highest revenue items (30d)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {bestSellers.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 text-sm">No data yet.</div>
                            ) : (
                                bestSellers.slice(0, 5).map((item, index) => (
                                    <div key={item.itemId} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <span className="text-xs font-bold text-slate-500">#{index + 1}</span>
                                            <span className="text-sm truncate max-w-[120px]" title={item.itemName}>{item.itemName}</span>
                                        </div>
                                        <span className="text-sm font-bold">${item.totalRevenue.toLocaleString()}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* SMART REORDER */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShoppingCart className="text-sky-400 h-5 w-5" />
                            Smart Restock
                        </CardTitle>
                        <CardDescription>Items with &lt;14 days cover</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {reorderSuggestions.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 text-sm flex flex-col items-center">
                                    <span className="text-emerald-500 mb-1">✓</span>
                                    Inventory levels healthy
                                </div>
                            ) : (
                                reorderSuggestions.slice(0, 5).map((item) => (
                                    <div key={item.itemId} className="flex items-center justify-between">
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-medium truncate max-w-[140px]" title={item.itemName}>{item.itemName}</p>
                                            <p className="text-xs text-rose-400">{Math.floor(item.daysToZero)} days left</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 block">Buy</span>
                                            <span className="text-sm font-bold text-sky-400">+{item.suggestedReorder}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* DEAD STOCK */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Skull className="text-slate-400 h-5 w-5" />
                            Zombie Stock
                        </CardTitle>
                        <CardDescription>Unsold &gt;60 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {deadStock.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 text-sm">No dead stock found.</div>
                            ) : (
                                deadStock.slice(0, 5).map((item) => (
                                    <div key={item.itemId} className="flex items-center justify-between">
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-medium truncate max-w-[140px]" title={item.itemName}>{item.itemName}</p>
                                            <p className="text-xs text-slate-500">{item.daysInStock} days old</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 block">Tied Up</span>
                                            <span className="text-sm font-bold text-slate-300">${item.value.toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
