"use client";

import { useState, useTransition, useEffect } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Input,
    Badge
} from "@/components/ui";
import {
    ArrowRightLeft,
    ChevronRight,
    Package,
    ArrowRight,
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    AlertCircle
} from "lucide-react";

import { transferInventory, getStockRequests, updateStockRequestStatus } from "../actions";

export default function TransfersPage({ db }: { db: any }) {
    const [isPending, startTransition] = useTransition();
    const [fromShop, setFromShop] = useState("");
    const [toShop, setToShop] = useState("");
    const [selectedItem, setSelectedItem] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [stockRequests, setStockRequests] = useState<any[]>([]);

    useEffect(() => {
        loadStockRequests();
        const interval = setInterval(loadStockRequests, 10000);
        return () => clearInterval(interval);
    }, []);

    const loadStockRequests = async () => {
        try {
            const res = await fetch('/api/stock-requests', { credentials: 'include' });
            const data = await res.json();
            setStockRequests(data.requests || []);
        } catch (err) {
            console.error('Failed to load stock requests:', err);
            setStockRequests([]);
        }
    };

    const canApprove = (role: string) => role === 'owner' || role === 'manager';

    const handleApprove = (requestId: string) => {
        startTransition(async () => {
            await updateStockRequestStatus(requestId, 'approved');
            loadStockRequests();
        });
    };

    const handleReject = (requestId: string) => {
        startTransition(async () => {
            await updateStockRequestStatus(requestId, 'rejected');
            loadStockRequests();
        });
    };

    const handleTransfer = () => {
        if (!fromShop || !toShop || !selectedItem || quantity <= 0) {
            alert("Please fill all fields correctly.");
            return;
        }

        startTransition(async () => {
            try {
                await transferInventory(selectedItem, fromShop, toShop, quantity);
                alert("Transfer successful!");
                setQuantity(1);
            } catch (err: any) {
                alert(err.message || "Transfer failed");
            }
        });
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Stock Transfers</h1>
                <p className="text-slate-400">Move inventory between Kipasa, Dub Dub, and Trade Center.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Active Inventory Status</CardTitle>
                        <CardDescription>Real-time stock levels across all locations.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {db.inventory.map((item: any) => (
                                <div key={item.id} className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded bg-violet-600/20 flex items-center justify-center text-violet-400">
                                            <Package className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-slate-100">{item.name}</h4>
                                            <p className="text-xs text-slate-500">{item.category}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        {db.shops.map((shop: any) => {
                                            const alloc = item.allocations.find((a: any) => a.shopId === shop.id);
                                            return (
                                                <div key={shop.id} className="text-center px-3 border-r border-slate-800 last:border-0">
                                                    <p className="text-[10px] uppercase text-slate-500 font-bold">{shop.name[0]}</p>
                                                    <p className="text-sm font-bold text-slate-300">{alloc ? alloc.quantity : 0}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {db.inventory.length === 0 && (
                                <div className="text-center py-20 text-slate-500">
                                    No inventory items found. Add stock in the Inventory Master.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass h-fit">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ArrowRightLeft className="h-5 w-5 text-primary" />
                            Quick Transfer
                        </CardTitle>
                        <CardDescription>Move stock instantly between shops.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">From Shop</label>
                            <select
                                className="w-full h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-200"
                                value={fromShop}
                                onChange={(e) => setFromShop(e.target.value)}
                            >
                                <option value="">Select source...</option>
                                {db.shops.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="flex justify-center py-1">
                            <ArrowRight className="h-5 w-5 text-slate-600 rotate-90 lg:rotate-0" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">To Shop</label>
                            <select
                                className="w-full h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-200"
                                value={toShop}
                                onChange={(e) => setToShop(e.target.value)}
                            >
                                <option value="">Select destination...</option>
                                {db.shops.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2 pt-2">
                            <label className="text-sm font-medium text-slate-300">Item</label>
                            <select
                                className="w-full h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-200"
                                value={selectedItem}
                                onChange={(e) => setSelectedItem(e.target.value)}
                            >
                                <option value="">Select item...</option>
                                {db.inventory.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Quantity</label>
                            <Input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 0)} />
                        </div>
                        <Button className="w-full mt-4" onClick={handleTransfer}>
                            Confirm Transfer
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-amber-500" />
                        Stock Transfer Requests
                    </CardTitle>
                    <CardDescription>Pending requests from team chat. Owner/Manager approval required.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {stockRequests.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                No pending stock requests. Use @shop need # item in chat to request stock.
                            </div>
                        ) : (
                            stockRequests.map((req: any) => (
                                <div key={req.id} className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        {req.status === 'pending' && <Clock className="h-5 w-5 text-amber-500" />}
                                        {req.status === 'approved' && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                                        {req.status === 'rejected' && <XCircle className="h-5 w-5 text-rose-500" />}
                                        {req.status === 'completed' && <CheckCircle className="h-5 w-5 text-slate-500" />}
                                        <div>
                                            <p className="font-bold text-slate-200">
                                                {req.quantity}x {req.item_name}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                From: {req.from_shop_id} → To: {req.to_shop_id}
                                            </p>
                                            <p className="text-[10px] text-slate-600">
                                                {new Date(req.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className={`${
                                            req.status === 'pending' ? 'bg-amber-500/20 text-amber-500' :
                                            req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-500' :
                                            req.status === 'rejected' ? 'bg-rose-500/20 text-rose-500' :
                                            'bg-slate-500/20 text-slate-500'
                                        }`}>
                                            {req.status}
                                        </Badge>
                                        {req.status === 'pending' && (
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" className="h-8 text-emerald-500 border-emerald-500/30" onClick={() => handleApprove(req.id)}>
                                                    <CheckCircle className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 text-rose-500 border-rose-500/30" onClick={() => handleReject(req.id)}>
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
