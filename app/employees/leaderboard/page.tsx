import { getStaffLeaderboard } from "@/lib/analytics";
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
    Trophy,
    Target,
    Zap,
    TrendingUp,
    Users,
    Star,
    Crown,
    Medal,
    ArrowLeft
} from "lucide-react";
import Link from "next/link";

export default async function LeaderboardPage() {
    const stats = await getStaffLeaderboard();

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <Link href="/employees">
                        <Button variant="link" className="p-0 h-auto text-violet-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2 hover:text-violet-300">
                            <ArrowLeft className="h-3 w-3 mr-1" /> Back to Registry
                        </Button>
                    </Link>
                    <h1 className="text-5xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-500">
                        Performance Battleground
                    </h1>
                    <p className="text-slate-400 font-medium tracking-tight">Real-time operative rankings across the NIRVANA network.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Top 3 Podium */}
                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
                    {stats.slice(0, 3).map((emp, idx) => (
                        <Card key={emp.id} className={`relative overflow-hidden border-2 transition-all hover:scale-[1.02] ${idx === 0 ? 'border-amber-500 bg-amber-500/5' :
                            idx === 1 ? 'border-slate-300 bg-slate-400/5' :
                                'border-orange-400 bg-orange-400/5'
                            }`}>
                            <CardHeader className="text-center pb-2">
                                <div className="absolute top-4 right-4 animate-bounce">
                                    {idx === 0 ? <Crown className="h-8 w-8 text-amber-500" /> :
                                        idx === 1 ? <Medal className="h-8 w-8 text-slate-300" /> :
                                            <Medal className="h-8 w-8 text-orange-400" />}
                                </div>
                                <div className="mx-auto h-20 w-20 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center text-xl font-black mb-4 shadow-2xl">
                                    {emp.name.split(' ').map((n: string) => n[0]).join('')}
                                </div>
                                <CardTitle className="text-2xl font-black uppercase tracking-tighter">{emp.name}</CardTitle>
                                <CardDescription className="uppercase font-black text-[10px] tracking-[0.3em] text-slate-500">
                                    {emp.role} @ {emp.shopId.toUpperCase()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex justify-around items-center pt-4">
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Pts</p>
                                        <p className="text-3xl font-black italic text-white">{emp.points}</p>
                                    </div>
                                    <div className="h-10 w-px bg-slate-800" />
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Revenue</p>
                                        <p className="text-xl font-black text-emerald-400">${emp.revenue.toLocaleString()}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                                        <span>Conversion Rate</span>
                                        <span>{emp.conversionRate.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                        <div
                                            className="h-full bg-violet-600 rounded-full shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                                            style={{ width: `${emp.conversionRate}%` }}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Main Rankings Table */}
                <div className="lg:col-span-2">
                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                                <Zap className="h-5 w-5 text-yellow-500" /> Full Rankings
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {stats.map((emp, idx) => (
                                    <div key={emp.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-950/50 border border-slate-800/50 group hover:border-violet-500/30 transition-all">
                                        <div className="w-8 text-center font-black italic text-slate-500 text-lg group-hover:text-violet-400 transition-colors">
                                            #{idx + 1}
                                        </div>
                                        <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-black">
                                            {emp.name.split(' ').map((n: string) => n[0]).join('')}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-black uppercase tracking-tight">{emp.name}</p>
                                            <p className="text-[10px] font-bold text-slate-600 uppercase">{emp.role}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-500 uppercase">Points</p>
                                            <p className="text-sm font-black text-white">{emp.points}</p>
                                        </div>
                                        <div className="w-32 hidden md:block">
                                            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Efficiency</p>
                                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500" style={{ width: `${(emp.revenue / stats[0].revenue) * 100}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Insights Panel */}
                <div className="space-y-6">
                    <Card className="bg-violet-900/10 border-violet-500/20 backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-violet-400">
                                <Star className="h-4 w-4" /> Network MVP
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-xl bg-violet-600/20 border border-violet-500/30">
                                <p className="text-[10px] font-black text-violet-400 uppercase tracking-[0.2em] mb-2">Most Consistent</p>
                                <p className="text-lg font-black italic mb-1">{stats[0]?.name}</p>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">Leads in total attributed revenue</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Top Shop</p>
                                    <p className="text-xs font-black text-white uppercase italic">{stats[0]?.shopId}</p>
                                </div>
                                <div className="flex-1 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Avg Conversion</p>
                                    <p className="text-xs font-black text-white italic">{(stats.reduce((acc, s) => acc + s.conversionRate, 0) / stats.length).toFixed(1)}%</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                                    <Target className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase italic">Monthly Challenge</p>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Convert 5 quotes to sales</p>
                                </div>
                            </div>
                            <Badge className="w-full justify-center bg-slate-800 text-slate-400 text-[10px] font-black uppercase py-1 border-slate-700">
                                4 Days Remaining
                            </Badge>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
