"use client";

import { useState, useEffect } from "react";
import { getDashboardData, exportDatabase } from "../../actions";
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
    ShieldCheck,
    History,
    Fingerprint,
    Search,
    Clock,
    User,
    ArrowRightCircle,
    Package,
    ShoppingCart,
    Shuffle,
    Users,
    Activity,
    Download,
    Save
} from "lucide-react";

export default function AuditPage() {
    const [db, setDb] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        getDashboardData().then(setDb);
    }, []);

    const handleExport = async () => {
        setLoading(true);
        try {
            const data = await exportDatabase();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nirvana_snapshot_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!db) return <div className="p-8 text-slate-500 animate-pulse uppercase font-black">Decrypting Ledger...</div>;

    const auditLog = [...(db.auditLog || [])].reverse();
    const filteredLog = auditLog.filter(entry =>
        entry.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getIcon = (action: string) => {
        if (action.includes('SALE')) return <ShoppingCart className="h-4 w-4 text-emerald-500" />;
        if (action.includes('INV')) return <Shuffle className="h-4 w-4 text-sky-500" />;
        if (action.includes('SHIPMENT')) return <Package className="h-4 w-4 text-violet-500" />;
        if (action.includes('EMPLOYEE')) return <Users className="h-4 w-4 text-amber-500" />;
        return <Activity className="h-4 w-4 text-slate-500" />;
    };

    return (
        <div className="space-y-8 pb-32 pt-8">
            <div className="space-y-1 text-center max-w-2xl mx-auto relative">
                <Badge className="bg-emerald-600/10 text-emerald-400 border-emerald-500/20 px-4 py-1 mb-4 uppercase text-[10px] font-black">
                    <ShieldCheck className="h-3 w-3 mr-2" /> Immutable Governance Layer
                </Badge>
                <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white flex items-center justify-center gap-4">
                    Security Audit <Fingerprint className="h-10 w-10 text-emerald-500" />
                </h1>
                <p className="text-slate-400 font-medium tracking-tight uppercase text-xs">Full activity history and operational accountability ledger.</p>

                <div className="absolute top-0 right-0 hidden md:block">
                    <Button
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-black text-[10px] uppercase h-8 hover:bg-emerald-500/10"
                        onClick={handleExport}
                        disabled={loading}
                    >
                        <Download className="h-3 w-3 mr-2" /> Snapshot
                    </Button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4 bg-slate-900 border-2 border-slate-800 p-4 rounded-2xl shadow-xl">
                    <Search className="h-5 w-5 text-slate-500 ml-2" />
                    <input
                        placeholder="Search by Action, Employee, or Details..."
                        className="bg-transparent border-none text-white w-full focus:outline-none font-bold placeholder:text-slate-600"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="space-y-3">
                    {filteredLog.length === 0 ? (
                        <div className="text-center py-24 opacity-20 italic font-black text-slate-500 uppercase tracking-widest">
                            No Audit Records Found.
                        </div>
                    ) : (
                        filteredLog.map((entry) => (
                            <Card key={entry.id} className="bg-slate-900/40 border-slate-800 hover:border-emerald-500/20 transition-all group">
                                <CardContent className="p-4 flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="bg-slate-950 p-3 rounded-xl border border-white/5 group-hover:bg-emerald-500/10 transition-colors">
                                            {getIcon(entry.action)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <Badge className="bg-slate-950 text-slate-400 text-[8px] font-black uppercase border-white/5">{entry.action}</Badge>
                                                <span className="text-[10px] font-black text-slate-600 uppercase flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> {new Date(entry.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-sm font-black text-white italic tracking-tight">{entry.details}</p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="flex items-center justify-end gap-2 mb-1">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Executor</span>
                                            <Badge variant="outline" className="text-[9px] font-black uppercase text-emerald-400 border-emerald-500/20 px-2">
                                                <User className="h-2 w-2 mr-1" /> {entry.employeeId}
                                            </Badge>
                                        </div>
                                        <p className="text-[8px] font-black text-slate-700 uppercase">Verification Hash: {entry.id.toUpperCase()}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
