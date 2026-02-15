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
    EyeOff
} from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input } from '@/components/ui';

const PASSWORDS = {
    admin: "nirvana-admin",
    kipasa: "kipasa-2026",
    dubdub: "dubdub-2026",
    tradecenter: "trade-2026"
};

const STAGES = [
    { id: 'admin', name: 'Stage 1: Admin Control', icon: ShieldCheck, description: 'Full access to all systems and analytics.' },
    { id: 'kipasa', name: 'Stage 2: Kipasa POS', icon: Store, description: 'Locked access to Kipasa point of sale.' },
    { id: 'dubdub', name: 'Stage 3: Dub Dub POS', icon: Store, description: 'Locked access to Dub Dub point of sale.' },
    { id: 'tradecenter', name: 'Stage 4: Trade Center POS', icon: Store, description: 'Locked access to Trade Center point of sale.' },
];

export function Gatekeeper({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [stage, setStage] = useState<string | null>(null);
    const [isLocked, setIsLocked] = useState(true);
    const [selectedStage, setSelectedStage] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const savedStage = localStorage.getItem('nirvana_stage');
        if (savedStage) {
            setStage(savedStage);
            setIsLocked(false);

            // Redirect if locked to a shop and on wrong path
            if (savedStage !== 'admin' && !pathname.startsWith(`/shops/${savedStage}`)) {
                router.push(`/shops/${savedStage}`);
            }
        }
        setIsInitializing(false);
    }, [pathname, router]);

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStage) return;

        const masterPassword = PASSWORDS.admin;
        const stagePassword = PASSWORDS[selectedStage as keyof typeof PASSWORDS];

        if (password === masterPassword || password === stagePassword) {
            localStorage.setItem('nirvana_stage', selectedStage);
            setStage(selectedStage);
            setIsLocked(false);
            setError("");
            setPassword("");

            if (selectedStage === 'admin') {
                router.push('/');
            } else {
                router.push(`/shops/${selectedStage}`);
            }
        } else {
            setError("Incorrect password for this stage.");
        }
    };

    const handleReset = () => {
        const adminPass = prompt("Enter Admin Password to Unlock Stage Selector:");
        if (adminPass === PASSWORDS.admin) {
            localStorage.removeItem('nirvana_stage');
            setStage(null);
            setIsLocked(true);
            setSelectedStage(null);
        } else if (adminPass !== null) {
            alert("Unauthorized.");
        }
    };

    if (isInitializing) return null;

    if (isLocked) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-start md:justify-center p-4 overflow-y-auto pt-10 pb-20">
                <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 items-start md:items-center">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h1 className="text-4xl font-black italic tracking-tighter uppercase gradient-text">Nirvana Gatekeeper</h1>
                            <p className="text-slate-400 font-medium">Select an operational stage to continue.</p>
                        </div>

                        <div className="grid gap-3">
                            {STAGES.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setSelectedStage(s.id);
                                        setError("");
                                    }}
                                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${selectedStage === s.id
                                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]'
                                        : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                                        }`}
                                >
                                    <div className={`p-2 rounded-lg ${selectedStage === s.id ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}`}>
                                        <s.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className={`font-bold uppercase tracking-tight ${selectedStage === s.id ? 'text-primary' : 'text-slate-200'}`}>{s.name}</h3>
                                        <p className="text-xs text-slate-500 font-medium">{s.description}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        {selectedStage ? (
                            <Card className="bg-slate-900 border-slate-800 shadow-2xl animate-in fade-in slide-in-from-right-4">
                                <CardHeader>
                                    <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                                        <Lock className="h-5 w-5 text-primary" /> Unlock Stage
                                    </CardTitle>
                                    <CardDescription>Enter the password for {STAGES.find(s => s.id === selectedStage)?.name}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleUnlock} className="space-y-4">
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? "text" : "password"}
                                                placeholder="Stage Password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="bg-slate-950 border-slate-800 h-12 pr-12 font-mono"
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                            </button>
                                        </div>
                                        {error && (
                                            <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                                                <AlertCircle className="h-4 w-4" /> {error}
                                            </div>
                                        )}
                                        <Button type="submit" className="w-full h-12 font-black uppercase tracking-widest text-sm">
                                            Access System <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-3xl">
                                <Lock className="h-12 w-12 mb-4 opacity-20" />
                                <p className="font-bold uppercase tracking-widest text-xs">Stage Selection Required</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {children}
            {/* Hidden reset button for admin (bottom right) */}
            <button
                onClick={handleReset}
                className="fixed bottom-4 right-4 z-[90] p-2 bg-slate-900/10 hover:bg-slate-900/50 text-slate-800 hover:text-slate-400 rounded-lg transition-all border border-transparent hover:border-slate-800"
                title="Admin Unlock"
            >
                <Unlock className="h-4 w-4" />
            </button>
        </>
    );
}
