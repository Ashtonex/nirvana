export const dynamic = 'force-dynamic';

import { getDashboardData, getGlobalSettings } from "../../actions";
import {
    Calculator,
    Receipt,
    Scale,
    TrendingDown,
    TrendingUp,
    FileText,
    ArrowUpRight,
    AlertCircle
} from "lucide-react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardDescription,
    Badge,
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
    TableFooter,
    Button
} from "@/components/ui";
import { TaxReportingControls } from "./TaxReportingControls";
import { TaxLedgerFiltered } from "./TaxLedgerFiltered";

export default async function TaxPage() {
    const db = await getDashboardData();
    const settings = await getGlobalSettings();

    if (!settings) return <div>Data sync error. Settings not found.</div>;

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-2 text-center max-w-3xl mx-auto">
                <div className="flex justify-center mb-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
                        <Scale className="h-10 w-10 sm:h-16 sm:w-16 text-emerald-500 relative" />
                    </div>
                </div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-white leading-none">
                    Fiscal Governance
                </h1>
                <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
                    Tax Ledger & ZIMRA Compliance Monitor
                </p>
            </div>

            {/* Period Selector and Reporting Controls at top */}
            <Card className="bg-slate-950/40 border-slate-800 sticky top-0 z-10">
                <CardHeader>
                    <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2 text-sky-500">
                        <Receipt className="h-4 w-4" /> Reporting Controls
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <TaxLedgerFiltered shops={db.shops} sales={db.sales || []} settings={settings} />
                </CardContent>
            </Card>
        </div>
    );
}

