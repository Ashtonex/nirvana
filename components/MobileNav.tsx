"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Home, Package, ClipboardList, Users, Menu } from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function MobileNav() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const stage = localStorage.getItem('nirvana_stage');
        setVisible(stage === 'admin');
    }, []);

    if (!visible) return null;

    const tabs = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Inventory', href: '/inventory', icon: Package },
        { name: 'Audit', href: '/inventory/stocktake', icon: ClipboardList },
        { name: 'Team', href: '/employees', icon: Users },
        { name: 'Menu', href: '/mobile-menu', icon: Menu }, // We'll need a mobile menu page or Drawer later
    ];

    // Hide if not on mobile? No, layout handles that.

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-800 bg-slate-950/80 backdrop-blur-lg md:hidden">
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
