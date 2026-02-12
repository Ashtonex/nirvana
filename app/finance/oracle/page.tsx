import { getDashboardData, getZombieStockReport } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Button
} from "@/components/ui";
import {
    Sprout,
    Compass,
    Activity,
    Target,
    Zap,
    TrendingUp,
    TrendingDown,
    Flame,
    Rocket,
    BarChart3,
    ArrowUpRight,
    Skull,
    Ghost,
    AlertTriangle,
    Banknote
} from "lucide-react";

export default async function OraclePage() {
    const db = await getDashboardData();
    const zombies = await getZombieStockReport();

    // Financial calculations
    const globalExpenses = db.globalExpenses || {};
    const monthlyBurn = Object.values(globalExpenses).reduce((acc: number, val: any) => acc + (val || 0), 0);

    const totalZombieCapital = zombies.reduce((acc, z) => acc + z.deadCapital, 0);
    const totalZombieBleed = zombies.reduce((acc, z) => acc + z.totalBleed, 0);

    // Calculate 30-day profit
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentSales = db.sales.filter(s => new Date(s.date) >= thirtyDaysAgo);

    // Revenue and Gross Profit
    const revenue = recentSales.reduce((acc, s) => acc + s.totalWithTax, 0);

    // Approx Gross Profit (Revenue - Landed Cost)
    const grossProfit = recentSales.reduce((acc, s) => {
        const item = db.inventory.find(i => i.id === s.itemId);
        const cost = item ? item.landedCost * s.quantity : (s.unitPrice * 0.6) * s.quantity; // Fallback
        return acc + (s.totalWithTax - cost);
    }, 0);

    const netIncome = grossProfit - monthlyBurn;
    const profitMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    // Survival Analytics
    // Assuming a starting cash position (simplified for demo)
    const startingCash = 25000;
    const currentLiquidity = startingCash + netIncome;
    const runwayMonths = netIncome < 0 ? Math.abs(currentLiquidity / netIncome) : Infinity;

    // Expansion Readiness (Simple Logic)
    const expansionScore = Math.min(100, (netIncome > 0 ? (netIncome / monthlyBurn) * 100 : 0));

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-1 text-center max-w-2xl mx-auto">
                <Badge className="bg-violet-600/10 text-violet-400 border-violet-500/20 px-4 py-1 mb-4">
                    <Compass className="h-3 w-3 mr-2" /> Financial Intelligence Layer
                </Badge>
                <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white flex items-center justify-center gap-4">
                    The Oracle <Flame className="h-10 w-10 text-orange-500 animate-pulse" />
                </h1>
                <p className="text-slate-400 font-medium tracking-tight">Predictive forecasting based on current burn rates and market capture.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Core Status Card */}
                <Card className="md:col-span-3 bg-gradient-to-br from-slate-900 to-indigo-950 border-slate-800 border-2 overflow-hidden relative shadow-2xl">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <BarChart3 className="h-40 w-40 text-white" />
                    </div>
                    <CardHeader>
                        <CardTitle className="text-xl font-black uppercase italic text-slate-400">Survival Baseline</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monthly Burn Rate</p>
                            <p className="text-3xl font-black text-rose-400 font-mono italic">-${monthlyBurn.toLocaleString()}</p>
                            <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/10 text-[9px] uppercase font-black">Drain on Liquidity</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Gross Profit (30d)</p>
                            <p className="text-3xl font-black text-emerald-400 font-mono italic">+${grossProfit.toLocaleString()}</p>
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/10 text-[9px] uppercase font-black">Market Extraction</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Net Cash Delta</p>
                            <p className={`text-3xl font-black font-mono italic ${netIncome >= 0 ? 'text-violet-400' : 'text-amber-500'}`}>
                                {netIncome >= 0 ? '+' : ''}${netIncome.toLocaleString()}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase">Monthly Bottom Line</p>
                        </div>
                        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-xl relative">
                            <Rocket className="absolute -top-3 -right-3 h-8 w-8 text-violet-500 rotate-12" />
                            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">Estimated Runway</p>
                            <p className="text-4xl font-black text-white italic">
                                {runwayMonths === Infinity ? "UNLIMITED" : `${runwayMonths.toFixed(1)} Mo`}
                            </p>
                            <p className="text-[10px] font-black text-slate-500 uppercase mt-2">At current velocity</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Expansion Readiness */}
                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center justify-between">
                            <span>Expansion Ready</span>
                            <Badge className="bg-sky-500/10 text-sky-400 border-sky-500/20">{expansionScore.toFixed(0)}%</Badge>
                        </CardTitle>
                        <CardDescription className="text-xs font-bold text-slate-500 uppercase">Propensity for adding Node #4.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="relative h-24 w-24 mx-auto">
                            <svg className="h-full w-full rotate-[-90deg]">
                                <circle cx="48" cy="48" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-slate-800" />
                                <circle
                                    cx="48" cy="48" r="40" fill="transparent" stroke="currentColor" strokeWidth="8"
                                    className="text-sky-500 transition-all duration-1000 ease-in-out"
                                    strokeDasharray={`${(expansionScore / 100) * 251.2} 251.2`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-black text-xl italic">{expansionScore.toFixed(0)}</div>
                        </div>
                        <p className="text-[10px] text-center font-bold text-slate-500 uppercase leading-relaxed">
                            {expansionScore > 75 ? "Optimization complete. System ready for deployment of another location." : "Stabilization required. Net income must exceed burn rate by 20% for 3 consecutive months."}
                        </p>
                    </CardContent>
                </Card>

                {/* Efficiency Scoring */}
                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <Sprout className="h-5 w-5 text-emerald-500" /> Efficiency Score
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                    <span>Profit Margin</span>
                                    <span>{profitMargin.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500" style={{ width: `${profitMargin}%` }} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                                    <span>Operational Leverage</span>
                                    <span>{(revenue / monthlyBurn).toFixed(1)}x</span>
                                </div>
                                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, (revenue / monthlyBurn) * 10)}%` }} />
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-800">
                            <div className="flex justify-between items-center text-xs font-black uppercase">
                                <span className="text-slate-400 italic">Network Health</span>
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Optimal</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CRM/Zombie Predictive Alerts */}
                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <Target className="h-5 w-5 text-amber-500" /> Key Insights
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 flex items-start gap-3">
                            <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                                <span className="text-white">Velocity Spike:</span> Accessories are moving 20% faster this week. Consider increasing restocking frequency.
                            </p>
                        </div>
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 flex items-start gap-3">
                            <Skull className="h-4 w-4 text-rose-500 mt-0.5" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-relaxed">
                                <span className="text-white">Capital Trap:</span> You have <span className="text-rose-400">${totalZombieCapital.toLocaleString()}</span> locked in stock that hasn't moved for 60+ days.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* New Cash Recovery / Zombie Stock Section */}
                <Card className="md:col-span-3 bg-slate-950/40 border-rose-500/20 shadow-2xl overflow-hidden relative border-2">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Ghost className="h-40 w-40 text-rose-500" />
                    </div>
                    <CardHeader className="border-b border-rose-500/10">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-2xl font-black uppercase italic text-rose-500 flex items-center gap-3">
                                    <Skull className="h-8 w-8" /> Cash Recovery Operations
                                </CardTitle>
                                <CardDescription className="text-slate-500 font-bold uppercase text-[10px]">
                                    Zombie Stock Audit: Stagnant inventory consuming overhead without generating revenue.
                                </CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-500 uppercase">Total Dead Money</p>
                                <p className="text-3xl font-black text-rose-500 italic font-mono">${totalZombieCapital.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            {zombies.length === 0 ? (
                                <div className="text-center py-12 opacity-30 italic font-black text-slate-500 uppercase">
                                    No Zombie Stock Detected. Inventory is healthy.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {zombies.map(z => (
                                        <div key={z.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 group hover:border-rose-500/30 transition-all">
                                            <div className="flex justify-between items-start mb-3">
                                                <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/10 text-[8px] font-black uppercase italic tracking-widest px-2">
                                                    {z.daysInStock} Days Aging
                                                </Badge>
                                                <AlertTriangle className="h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                            <h4 className="text-xs font-black text-slate-100 uppercase truncate mb-1">{z.name}</h4>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-4">{z.category} • {z.quantity} Pieces</p>

                                            <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-600 uppercase">Locked Capital</p>
                                                    <p className="text-sm font-black text-slate-300 italic">${z.deadCapital.toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-black text-slate-600 uppercase">Cumulative Bleed</p>
                                                    <p className="text-sm font-black text-rose-400 italic">-${z.totalBleed.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-center">
                <Button className="bg-transparent border-2 border-slate-800 text-slate-500 font-black text-[10px] uppercase h-10 px-8 hover:bg-slate-900 hover:text-white transition-all">
                    Generate Full Forecast PDF <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
