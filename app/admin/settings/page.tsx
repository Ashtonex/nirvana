export const dynamic = 'force-dynamic';

import { updateGlobalSettings, getGlobalSettings } from "../../actions";
import {
    Settings,
    ShieldCheck,
    Zap,
    Scale,
    Calculator,
    ArrowUpRight,
    Skull,
    History,
    Save
} from "lucide-react";
import { Badge, Button, Input, Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui";
import NukeConsole from "@/components/NukeConsole";
import { TaxSettingsForm } from "./TaxSettingsForm";
import { getDashboardData } from "../../actions";
import { CashDrawerCorrection } from "./CashDrawerCorrection";

export default async function SettingsPage() {
    const settings = await getGlobalSettings();
    if (!settings) return <div>Inconsistent Oracle State. Error 404.</div>;
    const db = await getDashboardData();
    const shops = (db.shops || []).map((s: any) => ({ id: s.id, name: s.name }));

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-2 text-center max-w-3xl mx-auto">
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-sky-500/20 blur-2xl rounded-full" />
                        <Settings className="h-10 w-10 sm:h-16 sm:w-16 text-sky-500 relative" />
                    </div>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">
                    Fortress Settings
                </h1>
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
                    Fiscal Strategy & System Integrity Configuration
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                {/* TAX STRATEGY CARD */}
                <Card className="bg-slate-950/40 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <Calculator className="h-5 w-5 text-emerald-500" /> ZIMRA Fiscal Strategy
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase italic">Thresholds & Dynamic Computation</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <TaxSettingsForm settings={settings} />
                    </CardContent>
                </Card>

                {/* SYSTEM INTEGRITY CARD */}
                <Card className="bg-slate-950/40 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-lg font-black uppercase italic flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-violet-500" /> Intelligence Constants
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase italic">Autonomous System Parameters</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <form action={async (formData: FormData) => {
                            "use server";
                            await updateGlobalSettings({
                                zombieDays: Number(formData.get('zombieDays')),
                                currencySymbol: formData.get('currencySymbol') as string
                            });
                        }} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Zombie Stock Threshold (Days)</label>
                                <Input
                                    name="zombieDays"
                                    type="number"
                                    defaultValue={settings.zombieDays}
                                    className="bg-slate-900 border-slate-800 font-bold"
                                />
                                <p className="text-[10px] text-slate-500 italic mt-1 uppercase leading-tight font-bold">
                                    Products unsold for longer than this period are flagged as "Dead Revenue."
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Primary Currency Symbol</label>
                                <Input
                                    name="currencySymbol"
                                    type="text"
                                    defaultValue={settings.currencySymbol}
                                    className="bg-slate-900 border-slate-800 font-bold"
                                />
                            </div>

                            <Button type="submit" className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-[10px] font-black uppercase italic tracking-widest border border-slate-700">
                                <Save className="mr-2 h-4 w-4" /> Update Intelligence Layer
                            </Button>
                        </form>

                        <div className="pt-6 border-t border-slate-800 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[10px] font-black uppercase text-emerald-500 italic">Atomic File-Locking Active</span>
                            </div>
                            <p className="text-[10px] text-slate-500 uppercase leading-relaxed font-bold">
                                The Fort Knox integrity system is currently shielding the database from concurrent write collisions and data corruption.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="max-w-3xl mx-auto">
                <CashDrawerCorrection shops={shops} />
            </div>

            <div className="max-w-3xl mx-auto">
                <NukeConsole />
            </div>
        </div>
    );
}

