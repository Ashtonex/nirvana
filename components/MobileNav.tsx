"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Home, Package, Menu, MessageSquare, ArrowRightLeft } from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStaff } from '@/components/StaffProvider';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const ALLOWED_EMAIL = "flectere@dev.com";

export function MobileNav() {
    const pathname = usePathname();
    const { staff, loading: staffLoading } = useStaff();
    const [canShow, setCanShow] = useState(false);

    // Don't show for staff
    if (staffLoading || staff) return null;

    useEffect(() => {
        fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data?.user?.email === ALLOWED_EMAIL) {
                    setCanShow(true);
                }
            })
            .catch(() => {});
    }, []);

    // Only show for specific allowed user
    if (!canShow) return null;

    const tabs = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Inventory', href: '/inventory', icon: Package },
        { name: 'Chat', href: '/chat', icon: MessageSquare },
        { name: 'Transfers', href: '/transfers', icon: ArrowRightLeft },
        { name: 'Menu', href: '/mobile-menu', icon: Menu },
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
                                    ? "text-primary"
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
