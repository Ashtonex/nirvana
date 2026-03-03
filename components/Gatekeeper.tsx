"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    ShieldCheck,
    Store,
    Lock,
    Unlock,
    ArrowRight,
    AlertCircle,
    Eye,
    EyeOff,
    Loader2
} from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input } from '@/components/ui';
import { useAuth } from './AuthProvider';

const STAGES = [
    { id: 'admin', name: 'Admin Dashboard', icon: ShieldCheck, description: 'Full access to all systems and analytics.', allowedRoles: ['owner'] },
    { id: 'kipasa', name: 'Kipasa POS', icon: Store, description: 'Kipasa store point of sale.', allowedRoles: ['sales', 'manager', 'owner'] },
    { id: 'dubdub', name: 'Dubdub POS', icon: Store, description: 'Dubdub store point of sale.', allowedRoles: ['sales', 'manager', 'owner'] },
    { id: 'tradecenter', name: 'Trade Center POS', icon: Store, description: 'Trade Center point of sale.', allowedRoles: ['sales', 'manager', 'owner'] },
];

export function Gatekeeper({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, employee, loading, signIn, signOut } = useAuth();
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            if (!pathname.startsWith('/login')) {
                router.push('/login');
            }
        }
    }, [user, loading, pathname, router]);

    if (loading) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-950 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 text-violet-500 animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">Loading Nirvana...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        router.push('/login');
        return null;
    }

    const userRole = employee?.role;
    const userShop = employee?.shop_id;

    const getAccessibleStages = () => {
        if (userRole === 'owner') {
            return STAGES;
        }
        return STAGES.filter(s => s.allowedRoles.includes(userRole || 'sales'));
    };

    const getDefaultStage = () => {
        if (userRole === 'owner') {
            return '/';
        }
        if (userShop) {
            return `/shops/${userShop}`;
        }
        return '/';
    };

    const accessibleStages = getAccessibleStages();
    const defaultStage = getDefaultStage();

    useEffect(() => {
        if (user && employee) {
            if (pathname === '/login') {
                router.push(defaultStage);
            }
        }
    }, [user, employee, defaultStage, pathname, router]);

    const handleLogout = async () => {
        await signOut();
        router.push('/login');
    };

    return (
        <>
            {children}
            {employee && (
                <div className="fixed bottom-4 right-4 z-[90] flex items-center gap-2">
                    <div className="bg-slate-900/90 backdrop-blur px-3 py-2 rounded-lg border border-slate-800 flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-slate-400 uppercase">
                            {employee.name} ({employee.role})
                        </span>
                        <button
                            onClick={handleLogout}
                            className="ml-2 text-slate-500 hover:text-rose-500 transition-colors"
                            title="Sign Out"
                        >
                            <Unlock className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
