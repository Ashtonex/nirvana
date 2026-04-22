'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Loader2 } from 'lucide-react';

type Item = {
  id: string;
  name: string | null;
  category: string | null;
  quantity: number;
  allocated: number;
  allocations: Record<string, number>;
  reorderLevel: number;
  lastSold: string | null;
  price: number;
};

export function InventoryHealth() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/hand/stock-data?status=all', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load stock data');
        const data = await res.json();
        if (!mounted) return;
        setItems(data.items || []);
      } catch (e: any) {
        setError(e.message || 'Error');
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const flagged = items.filter(i => i.quantity !== (i.allocated || 0));

  return (
    <div className="mt-6">
      <Card className="bg-slate-900/60 border-white/5">
        <CardHeader>
          <CardTitle className="text-lg">Inventory Health</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
            </div>
          ) : error ? (
            <div className="text-sm text-rose-400">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-400">No inventory items found.</div>
          ) : (
            <div className="space-y-3">
              {flagged.length === 0 ? (
                <div className="text-sm text-emerald-300">All allocations match master quantities.</div>
              ) : (
                flagged.slice(0, 20).map(item => (
                  <div key={item.id} className="rounded-lg border border-white/5 p-3 bg-slate-950/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white">{item.name || item.id}</div>
                        <div className="text-xs text-slate-400">Category: {item.category || 'General'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-300">Master: {item.quantity}</div>
                        <div className="text-sm text-amber-300">Allocated: {item.allocated}</div>
                        <div className="text-xs text-slate-500">Remaining: {item.quantity - (item.allocated || 0)}</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {Object.entries(item.allocations || {}).map(([shop, qty]) => (
                        <div key={shop} className="flex justify-between">
                          <span className="truncate">{shop}</span>
                          <span className="ml-2">{qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}

              {items.length > 20 && (
                <div className="text-xs text-slate-500">Showing first 20 flagged items. Use inventory page for full listing.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
