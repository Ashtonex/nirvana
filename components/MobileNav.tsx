"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, Menu, MessageSquare, ArrowRightLeft } from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// MobileNav is disabled - only show via URL for now
export function MobileNav() {
    return null;
}
