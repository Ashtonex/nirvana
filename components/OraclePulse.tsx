"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui";
import {
    Activity,
    ShieldCheck,
    Zap,
    AlertTriangle,
    TrendingUp,
    Mail,
    Clock,
    Skull,
    Target
} from "lucide-react";
import { cn } from "@/components/ui";

interface OraclePulseProps {
    data: {
        totalUnits: number;
        categoryBreakdown: Record<string, number>;
        finances: {
            revenue: number;
            tax: number;
            grossProfit: number;
            netIncome: number;
        };
        shopPerformance: {
            id: string;
            name: string;
            revenue: number;
            expenses: number;
            deposits?: number;
            progress: number;
        }[];
        deadCapital: number;
        zombieCount: number;
        recentEmails: any[];
    };
}

export function OraclePulse({ data }: OraclePulseProps) {
    // Guard against malformed data
    if (!data || typeof data !== 'object') {
        return (
            <div className="text-center text-slate-500 py-10">
                Loading pulse data...
            </div>
        );
    }

    const safeData = {
        totalUnits: typeof data.totalUnits === 'number' ? data.totalUnits : 0,
        categoryBreakdown: data.categoryBreakdown || {},
        finances: data.finances || { revenue: 0, tax: 0, grossProfit: 0, netIncome: 0 },
        shopPerformance: Array.isArray(data.shopPerformance) ? data.shopPerformance : [],
        deadCapital: typeof data.deadCapital === 'number' ? data.deadCapital : 0,
        zombieCount: typeof data.zombieCount === 'number' ? data.zombieCount : 0,
        recentEmails: Array.isArray(data.recentEmails) ? data.recentEmails : [],
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Global Inventory</CardDescription>
                        <CardTitle className="text-2xl font-black italic">{safeData.totalUnits.toLocaleString()} units</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase">
                            <ShieldCheck className="h-3 w-3" /> System Balanced
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gross Contribution</CardDescription>
                        <CardTitle className="text-2xl font-black italic text-emerald-400">${safeData.finances.grossProfit.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-[10px] font-bold text-slate-500 uppercase">After Landed Costs</div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tax Obligation (15.5%)</CardDescription>
                        <CardTitle className="text-2xl font-black italic text-amber-500">${safeData.finances.tax.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-[10px] font-bold text-slate-500 uppercase italic">Provisioned for Revenue Auth</div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-rose-500/20">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-[10px] font-black uppercase tracking-widest text-rose-500/50">Dead Revenue (Zombies)</CardDescription>
                        <CardTitle className="text-2xl font-black italic text-rose-500">${safeData.deadCapital.toLocaleString()}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase">
                            <Skull className="h-3 w-3" /> {safeData.zombieCount} items stagnant
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-950/40 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                        <Activity className="h-5 w-5 text-sky-500" /> Operational Pulse & Financial Integrity
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase italic">
                        Numbers-first readout (no charts)
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Revenue</p>
                            <p className="text-lg font-black italic text-emerald-400">${safeData.finances.revenue.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tax</p>
                            <p className="text-lg font-black italic text-amber-500">${safeData.finances.tax.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gross Profit</p>
                            <p className="text-lg font-black italic text-sky-300">${safeData.finances.grossProfit.toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Net Income</p>
                            <p className={cn(
                                "text-lg font-black italic",
                                safeData.finances.netIncome >= 0 ? "text-emerald-300" : "text-rose-400"
                            )}>
                                {safeData.finances.netIncome >= 0 ? "+" : ""}${safeData.finances.netIncome.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 overflow-hidden">
                        <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-slate-900/70 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <div>Shop</div>
                            <div className="text-right">Revenue</div>
                            <div className="text-right">Deposits</div>
                            <div className="text-right">Overhead</div>
                            <div className="text-right">Coverage</div>
                        </div>
                        {safeData.shopPerformance.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[10px] font-bold text-slate-600 uppercase italic">
                                No shop performance data available.
                            </div>
                        ) : (
                            safeData.shopPerformance.map((shop) => (
                                <div key={shop.id} className="grid grid-cols-5 gap-2 px-4 py-2 border-t border-slate-800 text-[10px] font-bold text-slate-300">
                                    <div className="truncate">{shop.name}</div>
                                    <div className="text-right text-emerald-400">${Number(shop.revenue || 0).toLocaleString()}</div>
                                    <div className="text-right text-sky-400">${Number(shop.deposits || 0).toLocaleString()}</div>
                                    <div className="text-right text-rose-300">${Number(shop.expenses || 0).toLocaleString()}</div>
                                    <div className={cn(
                                        "text-right font-black",
                                        Number(shop.progress || 0) >= 100 ? "text-emerald-400" : "text-amber-400"
                                    )}>
                                        {Number.isFinite(Number(shop.progress)) ? `${Number(shop.progress).toFixed(0)}%` : "—"}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-12">
                <Card className="md:col-span-8 bg-slate-950/40 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <Target className="h-5 w-5 text-violet-500" /> Network Node Performance
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase">Coverage = (Revenue + Perfume Deposits) / Overhead Target</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {safeData.shopPerformance.map(shop => (
                            <div key={shop.id} className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-sm font-black text-white uppercase italic">{shop.name}</p>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">
                                            <span className="text-emerald-400">${shop.revenue.toLocaleString()}</span> revenue + <span className="text-sky-400">${Number(shop.deposits || 0).toLocaleString()}</span> deposits / <span className="text-rose-400">${shop.expenses.toLocaleString()}</span> overhead
                                        </p>
                                    </div>
                                    <Badge className={cn(
                                        "text-[10px] font-black uppercase px-2",
                                        shop.progress >= 100 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                                    )}>
                                        {shop.progress >= 100 ? "Covered" : `${shop.progress.toFixed(0)}% Covered`}
                                    </Badge>
                                </div>
                                <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                    <div
                                        className={cn(
                                            "h-full transition-all duration-1000",
                                            shop.progress >= 100 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-sky-500"
                                        )}
                                        style={{ width: `${Math.min(100, shop.progress)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="md:col-span-4 bg-slate-950/40 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <Mail className="h-5 w-5 text-sky-500" /> Oracle Mailbox
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase italic">Automated Strategic Syncs</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {safeData.recentEmails.length === 0 ? (
                                <p className="text-center py-10 text-[10px] font-black text-slate-600 uppercase italic">No transmission history detected</p>
                            ) : safeData.recentEmails.map(email => (
                                <div key={email.id} className="p-3 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="outline" className={cn(
                                            "text-[8px] font-black uppercase italic tracking-tighter px-1.5 h-4",
                                            email.type === 'alert' ? "border-rose-500/50 text-rose-500" : "border-sky-500/50 text-sky-500"
                                        )}>
                                            {email.type}
                                        </Badge>
                                        <span className="text-[8px] font-black text-slate-600 font-mono uppercase italic">{new Date(email.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[10px] font-black text-slate-200 uppercase truncate">{email.subject}</p>
                                    <p className="text-[9px] font-bold text-slate-500 leading-tight line-clamp-2">{email.body}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
