import Link from 'next/link';
import {
    Home,
    Store,
    Package,
    RefreshCcw,
    BarChart3,
    Trophy,
    Users,
    ClipboardList,
    ShieldCheck,
    Settings,
    Flame
} from 'lucide-react';

const menuItems = [
    { name: 'Command Center', href: '/', icon: Home, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Inventory Master', href: '/inventory', icon: Package, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { name: 'The Oracle', href: '/finance/oracle', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { name: 'Financials', href: '/finance', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'Stocktake Audit', href: '/inventory/stocktake', icon: ClipboardList, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'Employee Registry', href: '/employees', icon: Users, color: 'text-sky-500', bg: 'bg-sky-500/10' },
    { name: 'Kipasa Shop', href: '/shops/kipasa', icon: Store, color: 'text-pink-500', bg: 'bg-pink-500/10' },
    { name: 'Dub Dub Shop', href: '/shops/dubdub', icon: Store, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { name: 'Trade Center', href: '/shops/tradecenter', icon: Store, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { name: 'Transfers', href: '/transfers', icon: RefreshCcw, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { name: 'Leaderboard', href: '/employees/leaderboard', icon: Trophy, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { name: 'Security', href: '/admin/audit', icon: ShieldCheck, color: 'text-red-500', bg: 'bg-red-500/10' },
];

export default function MobileMenuPage() {
    return (
        <div className="min-h-screen bg-slate-950 pb-28">
            <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">
                        Menu
                    </h1>
                    <div className="p-1.5 bg-slate-900 rounded-full">
                        <Settings className="w-5 h-5 text-slate-400" />
                    </div>
                </div>

                <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
                    {menuItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900/40 border border-slate-800/50 transition-all active:scale-95 hover:bg-slate-800/50 group"
                        >
                            <div className={`p-2.5 rounded-lg ${item.bg} mb-2 group-hover:scale-110 transition-transform`}>
                                <item.icon className={`w-5 h-5 ${item.color}`} />
                            </div>
                            <span className="text-[10px] sm:text-xs font-bold text-slate-300 text-center line-clamp-1">
                                {item.name}
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/5 border border-primary/10">
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="text-sm font-bold text-white">Nirvana v0.1.0</h3>
                        <span className="text-[10px] text-primary font-bold">ALPHA</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mb-3">Multi-Shop Command Center</p>
                    <button className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] transition-colors">
                        Check for Updates
                    </button>
                </div>
            </div>
        </div>
    );
}