import { getDashboardData } from "../../actions";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Badge
} from "@/components/ui";
import {
    Printer,
    Download,
    ArrowLeft,
    FileText,
    MapPin,
    Calendar,
    Users,
    ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { Quotation, Employee } from "@/lib/db";

export default async function QuotationPage({ params }: { params: { quoteId: string } }) {
    const { quoteId } = await params;
    const db = await getDashboardData();
    const quotation = (db.quotations as Quotation[])?.find(q => q.id === quoteId);

    if (!quotation) return <div className="p-20 text-center font-black uppercase italic text-slate-500">Quotation Not Found</div>;

    const shop = db.shops.find(s => s.id === quotation.shopId);
    const employee = (db.employees as Employee[])?.find(e => e.id === quotation.employeeId);

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-32 pt-8 print:p-0 print:m-0 print:max-w-none">
            {/* Action Bar */}
            <div className="flex justify-between items-center print:hidden">
                <Link href={`/shops/${quotation.shopId}`}>
                    <Button variant="outline" className="h-9 border-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all">
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Store
                    </Button>
                </Link>
                <div className="flex gap-4">
                    <Button
                        onClick={() => typeof window !== 'undefined' && window.print()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase h-9 shadow-lg shadow-emerald-500/20"
                    >
                        <Printer className="h-4 w-4 mr-2" /> Print Quote
                    </Button>
                    <Button variant="outline" className="h-9 border-slate-800 text-[10px] font-black uppercase tracking-widest">
                        <Download className="h-4 w-4 mr-2" /> Export PDF
                    </Button>
                </div>
            </div>

            {/* Invoice Layout */}
            <div className="bg-white text-slate-950 p-12 rounded-xl shadow-2xl space-y-12 print:shadow-none print:p-0 print:rounded-none">
                {/* Header */}
                <div className="flex justify-between items-start border-b-4 border-slate-900 pb-8">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <h1 className="text-4xl font-black tracking-tighter italic uppercase text-slate-900">NIRVANA</h1>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Premium Distribution Network</p>
                        </div>
                        <div className="space-y-1 text-sm font-bold">
                            <p className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {shop?.name} Command Center</p>
                            <p className="text-slate-500">Location: {quotation.shopId.toUpperCase()}</p>
                        </div>
                    </div>
                    <div className="text-right space-y-2">
                        <div className="inline-block bg-slate-900 text-white px-4 py-1 text-xs font-black uppercase tracking-widest italic rounded">
                            Official Quotation
                        </div>
                        <p className="text-4xl font-black text-slate-900">#{quotation.id.toUpperCase()}</p>
                        <div className="space-y-0.5 text-xs font-bold text-slate-500">
                            <p>Date: {new Date(quotation.date).toLocaleDateString()}</p>
                            <p>Expires: {new Date(quotation.expiryDate).toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>

                {/* Bill To / Details */}
                <div className="grid grid-cols-2 gap-12">
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Attention</h2>
                        <div className="space-y-1">
                            <p className="text-xl font-black text-slate-900">{quotation.clientName}</p>
                            <p className="text-xs font-bold text-slate-500 uppercase italic">Valid for 7 business days</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Processed By</h2>
                        <div className="space-y-1">
                            <p className="text-sm font-black text-slate-900 uppercase">
                                {employee?.name || "System Automated"}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Authorized Representative</p>
                        </div>
                    </div>
                </div>

                {/* Items Table */}
                <div className="space-y-4">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b-2 border-slate-900 text-[10px] font-black text-slate-900 uppercase tracking-widest">
                                <th className="pb-4">Description</th>
                                <th className="pb-4 text-center">Qty</th>
                                <th className="pb-4 text-right">Unit Price</th>
                                <th className="pb-4 text-right">Line Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {quotation.items.map((item: any, i: number) => (
                                <tr key={i}>
                                    <td className="py-6">
                                        <p className="text-sm font-black text-slate-900">{item.itemName}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Reference Item ID: {item.itemId}</p>
                                    </td>
                                    <td className="py-6 text-center font-bold text-slate-900">{item.quantity}</td>
                                    <td className="py-6 text-right font-mono text-slate-900">${item.unitPrice.toFixed(2)}</td>
                                    <td className="py-6 text-right font-black text-slate-900 font-mono">${(item.unitPrice * item.quantity).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals */}
                <div className="flex justify-end pt-8">
                    <div className="w-64 space-y-3">
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                            <span>Subtotal (Net)</span>
                            <span className="text-slate-900 font-mono font-black">${quotation.totalBeforeTax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase italic">
                            <span>Sales Tax (15.5%)</span>
                            <span className="text-slate-900 font-mono font-black">+${quotation.tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t-2 border-slate-900 pt-3">
                            <span className="text-sm font-black uppercase italic text-slate-900">Final Quote total</span>
                            <span className="text-2xl font-black text-slate-900 font-mono">${quotation.totalWithTax.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Footer Notes */}
                <div className="pt-12 border-t border-slate-100 space-y-4">
                    <div className="flex items-center gap-2 text-rose-600">
                        <ShieldCheck className="h-4 w-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest italic">Authenticity Guaranteed</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed max-w-2xl uppercase">
                        Terms: This quotation is an offer to sell the goods described above at the prices provided. It is not an invoice. Prices represent landed cost inclusives of logistics and overhead rationalization as of {new Date(quotation.date).toLocaleDateString()}. Acceptance of this quote will trigger an inventory allocation lock.
                    </p>
                </div>
            </div>
        </div>
    );
}
