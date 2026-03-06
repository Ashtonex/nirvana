"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { TrendingUp, TrendingDown, Award, AlertCircle, ShoppingCart, Skull, Zap, Target, Scale, DollarSign } from "lucide-react";

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
    const [insightIndex, setInsightIndex] = useState(0);

    const insights = [
        {
            title: "Inventory Alert",
            icon: <AlertCircle className="text-rose-400" />,
            content: reorderSuggestions.length > 0
                ? `Stockout Risk: ${reorderSuggestions.length} items are critically low. Top priority: ${reorderSuggestions[0]?.itemName}.`
                : "Inventory levels are currently stabilized across all categories."
        },
        {
            title: "Revenue Pulse",
            icon: <Zap className="text-amber-400" />,
            content: isGrowthPositive
                ? `Growth is at ${trends.growth.toFixed(1)}%. Maintain momentum by ensuring ${bestSellers[0]?.itemName || "top items"} are never out of stock.`
                : `Revenue is down ${Math.abs(trends.growth).toFixed(1)}%. Consider a 15% markdown on low-velocity items to boost cash flow.`
        },
        {
            title: "Capital Efficiency",
            icon: <Scale className="text-sky-400" />,
            content: deadStock.length > 0
                ? `$${deadStock.reduce((s, i) => s + i.value, 0).toLocaleString()} is tied up in "Zombie Stock". Convert these to cash via bundle deals.`
                : "Capital allocation is highly efficient. No significant dead stock detected."
        },
        {
            title: "Margin Opportunity",
            icon: <Target className="text-violet-400" />,
            content: bestSellers[0]
                ? `${bestSellers[0].itemName} has high velocity. A minor 2.5% price adjustment could yield significant monthly profit gains.`
                : "Identify your highest velocity items to optimize price-to-demand elasticity."
        },
        {
            title: "Operational Focus",
            icon: <DollarSign className="text-emerald-400" />,
            content: "Break-even target is approaching. Monitor daily cumulative sales vs. overhead alignment in the trajectory chart below."
        }
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setInsightIndex((prev) => (prev + 1) % insights.length);
        }, 60000); // Change every minute
        return () => clearInterval(timer);
    }, [insights.length]);

    const activeInsight = insights[insightIndex];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
                {/* TRENDS CARD */}
                <Card className="border-l-4 border-l-primary bg-slate-900/50 backdrop-blur-sm">
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
                <Card className="border-l-4 border-l-violet-500 bg-slate-900/50 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <span className="text-[60px] font-black italic uppercase">Oracle</span>
                    </div>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {activeInsight.icon}
                            {activeInsight.title}
                        </CardTitle>
                        <CardDescription>Dynamic Strategic Intelligence</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm animate-in fade-in slide-in-from-right-2 duration-500">
                            {activeInsight.content}
                        </p>
                        <div className="mt-4 flex gap-1">
                            {insights.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${i === insightIndex ? 'bg-violet-500' : 'bg-slate-800'}`}
                                />
                            ))}
                        </div>
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
