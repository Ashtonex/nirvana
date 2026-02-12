import { getDashboardData, deleteQuotation, finalizeQuotation } from "../../actions";
import Link from "next/link";
import POS from "./POS";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Button
} from "@/components/ui";
import {
    DollarSign,
    TrendingUp,
    Package,
    Clock,
    Users,
    FileText,
    ShieldCheck,
    Trash2,
    Calendar,
    ArrowRight,
    CheckCircle
} from "lucide-react";

export default async function ShopPage({ params }: { params: { shopId: string } }) {
    const { shopId } = await params;
    const db = await getDashboardData();
    const shop = db.shops.find(s => s.id === shopId);

    if (!shop) return <div>Shop not found</div>;

    const shopSales = db.sales.filter(s => s.shopId === shopId);
    const shopQuotes = (db.quotations || []).filter(q => q.shopId === shopId && q.status === 'pending');
    const shopEmployees = (db.employees || []).filter(e => e.shopId === shopId && e.active);

    const totalRev = shopSales.reduce((sum, s) => sum + s.totalWithTax, 0);
    const inventoryCount = db.inventory.reduce((sum, item) => {
        const allocation = item.allocations.find(a => a.shopId === shopId);
        return sum + (allocation ? allocation.quantity : 0);
    }, 0);

    return (
        <div className="space-y-8 pb-32">
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <h1 className="text-4xl font-black tracking-tighter uppercase italic">{shop.name}</h1>
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Operational</Badge>
                    </div>
                    <p className="text-slate-400 font-medium tracking-tight">Strategic command for location {shopId.toUpperCase()}</p>
                </div>
                <div className="flex gap-8">
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Store Revenue</p>
                        <p className="text-2xl font-black text-emerald-400 font-mono">${totalRev.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <DollarSign className="h-3 w-3 text-emerald-500" /> Performance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white font-mono">${totalRev.toLocaleString()}</div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Total Sales</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Package className="h-3 w-3 text-sky-500" /> Stock Level
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white font-mono">{inventoryCount} <span className="text-sm font-bold text-slate-500">Pcs</span></div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Available Units</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <FileText className="h-3 w-3 text-amber-500" /> Quotations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white font-mono">{shopQuotes.length} <span className="text-sm font-bold text-slate-500 tracking-normal">Active</span></div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Pending conversion</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/40 border-slate-800/50 backdrop-blur-md">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Users className="h-3 w-3 text-violet-500" /> Team
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex -space-x-2 overflow-hidden">
                            {shopEmployees.map((emp, i) => (
                                <div key={emp.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-slate-900 bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-[10px] font-black text-white border-2 border-slate-950">
                                    {emp.name.split(' ').map(n => n[0]).join('')}
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 truncate">
                            {shopEmployees.map(e => e.name).join(', ')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <POS shopId={shopId} inventory={db.inventory} db={db} />

            {/* Pending Quotations List */}
            {shopQuotes.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h2 className="text-xl font-black uppercase italic text-slate-200 flex items-center gap-2">
                            <FileText className="h-5 w-5 text-amber-500" /> Pending Quotations
                        </h2>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {shopQuotes.map((quote) => (
                            <Card key={quote.id} className="bg-slate-900/20 border-slate-800 hover:border-amber-500/30 transition-all">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-sm font-black text-white truncate w-[180px]">
                                                {quote.clientName}
                                            </CardTitle>
                                            <CardDescription className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mt-1">
                                                <Calendar className="h-3 w-3" /> {new Date(quote.date).toLocaleDateString()}
                                            </CardDescription>
                                        </div>
                                        <Badge className="bg-amber-500/10 text-amber-500 text-[9px] uppercase font-black border-amber-500/20">
                                            #{quote.id}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quote Total</p>
                                        <p className="text-xl font-black text-amber-400 font-mono">${quote.totalWithTax.toFixed(2)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <form action={async () => {
                                            "use server";
                                            await finalizeQuotation(quote.id);
                                        }} className="flex-1">
                                            <Button size="sm" className="w-full h-8 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20">
                                                <CheckCircle className="h-3 w-3 mr-1" /> Finalize Sale
                                            </Button>
                                        </form>
                                        <Link href={`/quotations/${quote.id}`}>
                                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest border-slate-800 hover:bg-slate-800">
                                                View
                                            </Button>
                                        </Link>
                                        <form action={async () => {
                                            "use server";
                                            await deleteQuotation(quote.id, shopId);
                                        }}>
                                            <Button size="sm" variant="outline" className="w-8 h-8 p-0 border-slate-800 hover:border-rose-500/50 hover:text-rose-500 transition-all">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </form>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
