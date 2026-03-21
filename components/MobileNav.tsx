"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Package, Menu, MessageSquare, ArrowRightLeft, Settings, LayoutDashboard } from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStaff } from '@/components/StaffProvider';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function MobileNav() {
    const pathname = usePathname();
    const { staff } = useStaff();
    const [isOwnerOrAdmin, setIsOwnerOrAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function checkAuth() {
            try {
                const res = await fetch("/api/staff/me", { cache: "no-store", credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    const role = String(data?.staff?.role || "").toLowerCase();
                    if (role === "owner" || role === "admin") {
                        setIsOwnerOrAdmin(true);
                    }
                }
            } catch (e) {
                console.error("[MobileNav] Auth check error:", e);
            } finally {
                setLoading(false);
            }
        }
        checkAuth();
    }, []);

    // Don't show for staff (shop staff), only for owner/admin
    if (loading) return null;
    if (staff) return null;
    if (!isOwnerOrAdmin) return null;

    const tabs = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Inventory', href: '/inventory', icon: Package },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        { name: 'More', href: '/mobile-menu', icon: Menu },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-800 bg-slate-950/80 backdrop-blur-lg lg:hidden">
            <div className="grid h-full grid-cols-5">
                {tabs.map((tab) => {
                    const isActive = pathname === tab.href;
                    return (
                        <Link
                            key={tab.name}
                            href={tab.href}
                            className={cn(
                                "flex flex-col items-center justify-center space-y-1 transition-colors",
                                isActive
                                    ? "text-emerald-400"
                                    : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            <tab.icon className={cn("h-5 w-5", isActive && "animate-pulse")} />
                            <span className="text-[10px] font-medium">{tab.name}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
