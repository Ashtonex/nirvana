"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, ShoppingCart, BookOpen } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const tabs = [
  { name: "POS", href: "/tshirts", icon: ShoppingCart, exact: true },
  { name: "Analytics", href: "/tshirts/analytics", icon: BarChart3, exact: false },
  { name: "Reports", href: "/tshirts/reports", icon: FileText, exact: false },
  { name: "Setup", href: "/tshirts/setup-guide", icon: BookOpen, exact: true },
];

export function TshirtsNav() {
  const pathname = usePathname() || "";

  return (
    <nav className="flex flex-wrap gap-2 p-1 rounded-xl bg-slate-900/60 border border-orange-500/15 w-fit">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
              isActive
                ? "bg-orange-600 text-white shadow-lg shadow-orange-600/25"
                : "text-slate-400 hover:text-orange-300 hover:bg-slate-800/80"
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
