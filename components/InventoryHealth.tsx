'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { Loader2, Package, TrendingDown, AlertTriangle, RefreshCw, ArrowUpDown } from 'lucide-react';
import { cn } from '@/components/ui';

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
  totalSold?: number;
  shop?: string | null;
};

type Shop = {
  id: string;
  name: string;
};

export function InventoryHealth() {
  const [items, setItems] = useState<Item[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [apportionMode, setApportionMode] = useState<string | null>(null);
  const [apportionValues, setApportionValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, shopsRes] = await Promise.all([
        fetch(`/api/hand/stock-data?status=all&shop=${selectedShop}&category=${selectedCategory}&year=${selectedYear}&month=${selectedMonth}`, { credentials: 'include' }),
        fetch('/api/shops', { credentials: 'include' })
      ]);
      
      if (!itemsRes.ok) throw new Error('Failed to load stock data');
      const itemsData = await itemsRes.json();
      
      if (shopsRes.ok) {
        const shopsData = await shopsRes.json();
        setShops(shopsData.shops || []);
      }
      
      setItems(itemsData.items || []);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [selectedShop, selectedCategory, selectedYear, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApportion = async (itemId: string) => {
    setSaving(true);
    try {
      const promises = Object.entries(apportionValues).map(([shopId, qty]) =>
        fetch('/api/inventory/allocation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId, shopId, quantity: qty })
        })
      );
      
      await Promise.all(promises);
      setApportionMode(null);
      setApportionValues({});
      await loadData();
    } catch (e: any) {
      setError('Failed to update allocations');
    } finally {
      setSaving(false);
    }
  };

  const startApportion = (itemId: string) => {
    setApportionMode(itemId);
    const item = items.find(i => i.id === itemId);
    if (item) {
      setApportionValues(item.allocations || {});
    }
  };

  const flagged = items.filter(i => i.quantity !== (i.allocated || 0));
  const lowStock = items.filter(i => i.quantity <= (i.reorderLevel || 5));
  const categories = [...new Set(items.map(i => i.category || 'General'))];

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  return (
    <div className="mt-6 space-y-4">
      {/* Header with controls */}
      <Card className="bg-slate-900/60 border-white/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5" />
              Inventory Management
            </CardTitle>
            <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Year</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Month</label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Filter Shop</label>
              <Select value={selectedShop} onValueChange={setSelectedShop}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {shops.map(shop => (
                    <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Filter Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-white/5">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-400">Total Items</p>
            <p className="text-2xl font-bold text-white">{items.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/60 border-white/5">
          <CardContent className="pt-4">
            <p className="text-xs text-slate-400">Total Units</p>
            <p className="text-2xl font-bold text-emerald-400">{items.reduce((sum, i) => sum + i.quantity, 0)}</p>
          </CardContent>
        </Card>
        <Card className={cn('bg-slate-900/60 border-white/5', flagged.length > 0 && 'border-amber-500/30')}>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-400">Allocation Mismatch</p>
            <p className={cn('text-2xl font-bold', flagged.length > 0 ? 'text-amber-400' : 'text-emerald-400')}>{flagged.length}</p>
          </CardContent>
        </Card>
        <Card className={cn('bg-slate-900/60 border-white/5', lowStock.length > 0 && 'border-rose-500/30')}>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-400">Low Stock</p>
            <p className={cn('text-2xl font-bold', lowStock.length > 0 ? 'text-rose-400' : 'text-emerald-400')}>{lowStock.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Inventory List */}
      <Card className="bg-slate-900/60 border-white/5">
        <CardHeader>
          <CardTitle className="text-base">Inventory Items</CardTitle>
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
              {items.map(item => {
                const isMismatched = item.quantity !== (item.allocated || 0);
                const isLowStock = item.quantity <= (item.reorderLevel || 5);
                const remaining = item.quantity - (item.allocated || 0);
                
                return (
                  <div key={item.id} className={cn(
                    'rounded-lg border p-4 bg-slate-950/40',
                    isMismatched && 'border-amber-500/30',
                    isLowStock && 'border-rose-500/30'
                  )}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-white">{item.name || item.id}</div>
                          {isMismatched && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                          {isLowStock && <TrendingDown className="h-4 w-4 text-rose-400" />}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Category: {item.category || 'General'} | Last Sold: {item.lastSold || 'Never'}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm text-slate-300">Master: <span className="font-bold text-white">{item.quantity}</span></div>
                        <div className="text-sm text-slate-300">Allocated: <span className="font-bold text-amber-300">{item.allocated}</span></div>
                        <div className={cn('text-xs font-bold', remaining >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          Remaining: {remaining}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Sold this month: <span className="font-bold text-violet-400">{item.totalSold || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Shop Allocations */}
                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-400">Shop Allocations</p>
                        <Button 
                          onClick={() => startApportion(item.id)}
                          variant="outline" 
                          size="sm"
                          className="h-6 text-xs"
                        >
                          <ArrowUpDown className="h-3 w-3 mr-1" />
                          Apportion
                        </Button>
                      </div>
                      
                      {apportionMode === item.id ? (
                        <div className="space-y-2 bg-slate-900/50 p-3 rounded">
                          {shops.map(shop => (
                            <div key={shop.id} className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 w-24 truncate">{shop.name}</span>
                              <Input
                                type="number"
                                min="0"
                                value={apportionValues[shop.id] || 0}
                                onChange={(e) => setApportionValues(prev => ({
                                  ...prev,
                                  [shop.id]: parseInt(e.target.value) || 0
                                }))}
                                className="h-8 bg-slate-800 border-slate-700"
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 mt-2">
                            <Button 
                              onClick={() => handleApportion(item.id)}
                              disabled={saving}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button 
                              onClick={() => { setApportionMode(null); setApportionValues({}); }}
                              variant="outline"
                              size="sm"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(item.allocations || {}).map(([shopId, qty]) => {
                            const shop = shops.find(s => s.id === shopId);
                            return (
                              <div key={shopId} className="flex justify-between text-xs bg-slate-900/30 p-2 rounded">
                                <span className="text-slate-400 truncate">{shop?.name || shopId}</span>
                                <span className="font-bold text-white">{qty}</span>
                              </div>
                            );
                          })}
                          {Object.keys(item.allocations || {}).length === 0 && (
                            <div className="text-xs text-slate-500 col-span-4">No allocations</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
