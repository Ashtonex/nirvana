"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Store,
    Package,
    RefreshCcw,
    BarChart3,
    Settings,
    LayoutDashboard,
    Users,
    ArrowRightLeft,
    Trophy,
    Compass,
    Flame,
    ClipboardList,
    ShieldCheck
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const navItems = [
    { name: 'Command Center', href: '/', icon: Home },
    { name: 'Kipasa', href: '/shops/kipasa', icon: Store },
    { name: 'Dub Dub', href: '/shops/dubdub', icon: Store },
    { name: 'Trade Center', href: '/shops/tradecenter', icon: Store },
    { name: 'Inventory Master', href: '/inventory', icon: Package },
    { name: 'Stocktake Audit', href: '/inventory/stocktake', icon: ClipboardList },
    { name: 'Security Audit', href: '/admin/audit', icon: ShieldCheck },
    { name: 'The Oracle', href: '/finance/oracle', icon: Flame },
    { name: 'Staff Leaderboard', href: '/employees/leaderboard', icon: Trophy },
    { name: 'Employee Registry', href: '/employees', icon: Users },
    { name: 'Transfers', href: '/transfers', icon: RefreshCcw },
    { name: 'Financials', href: '/finance', icon: BarChart3 },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Data Vault', href: '/admin/backups', icon: ShieldCheck },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="hidden md:flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl">
            <div className="flex h-20 items-center px-6">
                <h1 className="text-2xl font-bold gradient-text">NIRVANA</h1>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                            )}
                        >
                            <item.icon className={cn(
                                "mr-3 h-5 w-5 transition-colors",
                                isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto border-t border-slate-800 p-4">
                <div className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-100 transition-colors cursor-pointer">
                    <Settings className="mr-3 h-5 w-5" />
                    Settings
                </div>
            </div>
        </div>
    );
}
