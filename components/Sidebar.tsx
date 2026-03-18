"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
    ShieldCheck,
    Scale,
    LogOut,
    FileText,
    Wallet,
    HandCoins,
    Cpu
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useStaff } from '@/components/StaffProvider';
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
    { name: 'Global Inventory', href: '/admin/inventory-manager', icon: ArrowRightLeft },
    { name: 'POS Audit', href: '/admin/pos-audit', icon: ShieldCheck },
    { name: 'Security Audit', href: '/admin/audit', icon: ShieldCheck },
    { name: 'The Oracle', href: '/finance/oracle', icon: Flame },
    { name: "Oracle's Eye", href: '/intelligence', icon: Compass },
    { name: 'Staff Leaderboard', href: '/employees/leaderboard', icon: Trophy },
    { name: 'Employee Registry', href: '/employees', icon: Users },
    { name: 'Transfers', href: '/transfers', icon: RefreshCcw },
    { name: 'Tax Ledger', href: '/admin/tax', icon: Scale },
    { name: 'Financials', href: '/finance', icon: BarChart3 },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Operations', href: '/operations', icon: Wallet },
    { name: 'Invest', href: '/invest', icon: HandCoins },
    { name: 'Logic', href: '/logic', icon: Cpu },
    { name: 'EOD Reports', href: '/admin/eod', icon: FileText },
    { name: 'Data Vault', href: '/admin/backups', icon: ShieldCheck },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    // Owner auth (custom cookie) + Staff auth (custom session)
    const { signOut: ownerSignOut, user: ownerUser } = useAuth();
    const { signOut: staffSignOut, staff } = useStaff();

    // Staff should only see POS. No sidebar navigation.
    const staffRole = String(staff?.role || "").toLowerCase();
    const isPrivilegedStaff = !ownerUser && (staffRole === "owner" || staffRole === "admin");
    const isOwnerViaCookie = isPrivilegedStaff && staffRole === "owner";
    if (staff && !ownerUser && !isPrivilegedStaff) return null;

    const handleLogout = async () => {
        try {
            if (isOwnerViaCookie) {
                await fetch("/api/owner/logout", { method: "POST" });
                router.push("/login");
                return;
            }
            if (ownerUser?.email === "flectere@dev.com") {
                await fetch("/api/owner/logout", { method: "POST" });
                router.push('/login');
            } else if (ownerUser) {
                await ownerSignOut();
                router.push('/login');
            } else {
                await staffSignOut();
                router.push('/staff-login');
            }
        } catch {
            router.push('/login');
        }
    };

    return (
        <div className="hidden lg:flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl">
            <div className="flex h-20 items-center px-6">
                <img src="/logo.png" alt="Logo" className="h-10 w-10 object-contain mr-3" />
                <h1 className="text-2xl font-bold gradient-text tracking-tighter uppercase italic">NIRVANA</h1>
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
                <Link
                    href="/admin/settings"
                    className="flex items-center rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-slate-100 transition-colors cursor-pointer"
                >
                    <Settings className="mr-3 h-5 w-5" />
                    Settings
                </Link>

                <button
                    onClick={handleLogout}
                    className="mt-2 w-full flex items-center rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-900 hover:text-rose-400 transition-colors"
                >
                    <LogOut className="mr-3 h-5 w-5" />
                    Log Out
                </button>
            </div>
        </div>
    );
}
