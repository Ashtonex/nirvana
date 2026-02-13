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
        <div className="min-h-screen bg-slate-950 pb-24">
            <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                        Menu
                    </h1>
                    <div className="p-2 bg-slate-900 rounded-full">
                        <Settings className="w-6 h-6 text-slate-400" />
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {menuItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-900/50 border border-slate-800 transition-all active:scale-95 hover:bg-slate-800/50 group"
                        >
                            <div className={`p-3 rounded-xl ${item.bg} mb-2 group-hover:scale-110 transition-transform`}>
                                <item.icon className={`w-6 h-6 ${item.color}`} />
                            </div>
                            <span className="text-xs font-semibold text-slate-200 text-center line-clamp-1">
                                {item.name}
                            </span>
                        </Link>
                    ))}
                </div>

                <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 border border-primary/20">
                    <h3 className="text-lg font-bold text-white mb-2">Nirvana v0.1.0</h3>
                    <p className="text-sm text-slate-400 mb-4">Command Center for Multi-Shop Operations</p>
                    <button className="w-full py-3 rounded-xl bg-white text-slate-950 font-bold text-sm">
                        Check for Updates
                    </button>
                </div>
            </div>
        </div>
    );
}