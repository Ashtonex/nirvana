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

export default async function TaxPage() {
    const db = await getDashboardData();
    const settings = await getGlobalSettings();

    if (!settings) return <div>Data sync error. Settings not found.</div>;

    const sales = db.sales || [];
    const totalSales = sales.reduce((sum: number, s: any) => sum + s.totalWithTax, 0);

    // Theoretical Tax (15.5% flat)
    const flatTaxRate = 0.155;
    const theoreticalTax = sales.reduce((sum: number, s: any) => sum + (s.totalBeforeTax * flatTaxRate), 0);

    // Reported Tax (based on Oracle settings)
    const reportedTax = sales.reduce((sum: number, s: any) => sum + s.tax, 0);

    // Effectiveness / Ratio
    const taxSaving = theoreticalTax - reportedTax;

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

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp className="h-3 w-3 text-emerald-500" /> Standard Liability
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white font-mono">${theoreticalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Theoretical 15.5% Flat Tax</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Scale className="h-3 w-3 text-sky-500" /> Reported Liability
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-sky-400 font-mono">${reportedTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Based on {settings.taxMode === 'all' ? 'Flat' : 'Threshold'} Strategy</p>
                    </CardContent>
                </Card>

                <Card className="bg-emerald-500/5 border-emerald-500/20 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest flex items-center gap-2">
                            <TrendingDown className="h-3 w-3 text-emerald-500" /> Strategic Delta
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-emerald-400 font-mono">${taxSaving.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Fiscal Efficiency Gain</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="bg-slate-950/40 border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                            <FileText className="h-5 w-5 text-sky-500" /> Itemized Tax Ledger
                        </CardTitle>
                        <CardDescription className="text-[10px] font-bold uppercase italic mt-1">Detailed breakdown of fiscal contributions per transaction</CardDescription>
                    </div>
                    <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[10px] uppercase font-black">
                        Strategy: {settings.taxMode.replace('_', ' ')}
                    </Badge>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-slate-800">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-transparent">
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Date/ID</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Product</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500">Shop</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Unit Price</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Standard Tax</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Reported Tax</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sales.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-slate-500 font-bold italic text-sm">
                                            The ledger is silent. No fiscal records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sales.map((sale: any) => {
                                        const standardTax = sale.totalBeforeTax * flatTaxRate;
                                        const shopName = db.shops.find((s: any) => s.id === sale.shopId)?.name || sale.shopId;
                                        const isUnderThreshold = settings.taxMode === 'above_threshold' && sale.totalBeforeTax <= settings.taxThreshold;

                                        return (
                                            <TableRow key={sale.id} className="border-slate-800 hover:bg-slate-900/30 transition-colors">
                                                <TableCell className="font-mono text-[10px] text-slate-400">
                                                    <div>{new Date(sale.date).toLocaleDateString()}</div>
                                                    <div className="text-[8px] opacity-50">#{sale.id}</div>
                                                </TableCell>
                                                <TableCell className="font-bold text-white text-xs">
                                                    {sale.itemName}
                                                    <div className="text-[9px] text-slate-500 font-medium">Qty: {sale.quantity}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="border-slate-800 text-[9px] uppercase font-black py-0">
                                                        {shopName}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs font-bold">
                                                    ${sale.unitPrice.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-slate-500">
                                                    ${standardTax.toFixed(2)}
                                                </TableCell>
                                                <TableCell className={`text-right font-mono text-xs font-black ${sale.tax > 0 ? 'text-sky-400' : 'text-slate-600'}`}>
                                                    ${sale.tax.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isUnderThreshold ? (
                                                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[8px] font-black italic">EXEMPT</Badge>
                                                    ) : (
                                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[8px] font-black italic">FILED</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-8 md:grid-cols-2">
                <Card className="bg-slate-950/40 border-amber-500/20">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2 text-amber-500">
                            <AlertCircle className="h-4 w-4" /> Compliance Notice
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed">
                            The Oracle is currently filtering transactions based on your <span className="text-amber-500">Threshold Logic</span>.
                            Transactions under ${settings.taxThreshold} are being processed as non-fiscal entries in the cloud reporting layer.
                            Ensure this aligns with your regional regulatory requirements.
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-950/40 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-black uppercase italic flex items-center gap-2 text-sky-500">
                            <Receipt className="h-4 w-4" /> Reporting Controls
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                        <Button variant="outline" className="flex-1 h-10 border-slate-800 hover:bg-slate-900 text-[10px] font-black uppercase italic tracking-widest">
                            Export CSV
                        </Button>
                        <Button variant="outline" className="flex-1 h-10 border-slate-800 hover:bg-slate-900 text-[10px] font-black uppercase italic tracking-widest">
                            Print ZIMRA Log
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

