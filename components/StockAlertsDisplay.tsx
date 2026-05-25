'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, TrendingDown, Package, Truck } from 'lucide-react';
import type { StockAlert, ReorderStrategy } from '@/lib/stock-alerts';

type StockAlertsDisplayProps = {
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  onAddLog?: (level: 'info' | 'error' | 'success' | 'warning', message: string) => void;
};

export function StockAlertsDisplay({ onLoadStart, onLoadEnd, onAddLog }: StockAlertsDisplayProps) {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [strategies, setStrategies] = useState<Map<string, ReorderStrategy>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      onLoadStart?.();
      setLoading(true);
      try {
        const res = await fetch('/api/tshirts/stock-alerts', {
          cache: 'no-store',
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error('Failed to fetch stock alerts');
        }

        const data = await res.json();
        setAlerts(data.alerts || []);
        onAddLog?.('success', `Loaded ${data.alerts?.length || 0} stock alerts for Nirvana Tees.`);

        // Load reorder strategies for each item
        const stratMap = new Map<string, ReorderStrategy>();
        for (const alert of data.alerts || []) {
          try {
            const stratRes = await fetch(`/api/tshirts/reorder-strategy?itemId=${encodeURIComponent(alert.itemId)}`, {
              cache: 'no-store',
              credentials: 'include',
            });
            if (stratRes.ok) {
              const strat = await stratRes.json();
              if (strat.strategy) {
                stratMap.set(alert.itemId, strat.strategy);
              }
            }
          } catch (err) {
            console.error(`Failed to load strategy for ${alert.itemId}:`, err);
          }
        }
        setStrategies(stratMap);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        onAddLog?.('error', msg);
      } finally {
        setLoading(false);
        onLoadEnd?.();
      }
    };

    load();
  }, [onLoadStart, onLoadEnd, onAddLog]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-8 text-center">
        <Package className="h-8 w-8 mx-auto text-slate-500 animate-pulse" />
        <p className="mt-4 text-slate-400">Loading stock alerts...</p>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center">
        <Package className="h-8 w-8 mx-auto text-emerald-400" />
        <p className="mt-4 font-black text-lg text-emerald-300">All Clear</p>
        <p className="mt-2 text-emerald-200/80 text-sm">No stock alerts at Nirvana Tees. All items are in good supply.</p>
      </div>
    );
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const highCount = alerts.filter((a) => a.severity === 'high').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">Critical Alerts</p>
          <p className="mt-2 text-3xl font-black text-rose-300">{criticalCount}</p>
          <p className="mt-1 text-[10px] text-rose-200/60">Need immediate restock</p>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">High Priority</p>
          <p className="mt-2 text-3xl font-black text-amber-300">{highCount}</p>
          <p className="mt-1 text-[10px] text-amber-200/60">Plan reorder within week</p>
        </div>
        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/30 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">Total Items</p>
          <p className="mt-2 text-3xl font-black text-sky-300">{alerts.length}</p>
          <p className="mt-1 text-[10px] text-sky-200/60">Requiring attention</p>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const strategy = strategies.get(alert.itemId);
          const isExpanded = expandedItem === alert.itemId;
          const severity =
            alert.severity === 'critical'
              ? 'border-rose-500/30 bg-rose-950/30'
              : alert.severity === 'high'
                ? 'border-amber-500/30 bg-amber-950/20'
                : 'border-sky-500/30 bg-sky-950/20';

          return (
            <div
              key={alert.itemId}
              className={`rounded-2xl border p-4 transition-all cursor-pointer hover:shadow-lg ${severity}`}
              onClick={() => setExpandedItem(isExpanded ? null : alert.itemId)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-current" />
                    <h3 className="font-black text-lg">{alert.itemName}</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-2">
                    <div>
                      <p className="text-[10px] uppercase font-bold opacity-60">Current Stock</p>
                      <p className="font-black text-base mt-1">{alert.currentStock} units</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold opacity-60">30D Sales</p>
                      <p className="font-black text-base mt-1">{alert.velocity30d} units</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold opacity-60">Daily Rate</p>
                      <p className="font-black text-base mt-1">{alert.avgDailySalesRate.toFixed(1)}/day</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold opacity-60">Days Till Out</p>
                      <p className={`font-black text-base mt-1 ${alert.daysUntilStockout <= 2 ? 'text-rose-300' : alert.daysUntilStockout <= 5 ? 'text-amber-300' : 'text-sky-300'}`}>
                        {alert.daysUntilStockout === 999 ? 'N/A' : alert.daysUntilStockout}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className={`flex-shrink-0 px-3 py-1 rounded-lg font-black uppercase text-[9px] tracking-wider ${
                    alert.severity === 'critical'
                      ? 'bg-rose-500/20 text-rose-300'
                      : alert.severity === 'high'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  {alert.severity}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && strategy && (
                <div className="mt-4 pt-4 border-t border-current/20 space-y-4 opacity-80">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-current/20 bg-black/30 p-3">
                      <p className="text-[10px] uppercase font-bold mb-2">Reorder Strategy</p>
                      <div className="space-y-2 text-xs">
                        <p>
                          <span className="opacity-60">Qty:</span> <span className="font-bold">{strategy.recommendedQty} units</span>
                        </p>
                        <p>
                          <span className="opacity-60">Est. Cost:</span> <span className="font-bold">${strategy.estimatedCost.toFixed(2)}</span>
                        </p>
                        <p>
                          <span className="opacity-60">Urgency:</span>{' '}
                          <span className="font-bold uppercase">{strategy.urgency}</span>
                        </p>
                        <p className="opacity-70 leading-relaxed">{strategy.rationale}</p>
                      </div>
                    </div>

                    {strategy.fromSupplier && (
                      <div className="rounded-xl border border-current/20 bg-black/30 p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <Truck className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] uppercase font-bold">Last Source</p>
                        </div>
                        <div className="space-y-2 text-xs">
                          <p>
                            <span className="opacity-60">Supplier:</span> <span className="font-bold">{strategy.fromSupplier}</span>
                          </p>
                          <p>
                            <span className="opacity-60">Unit Price:</span> <span className="font-bold">${strategy.lastPrice.toFixed(2)}</span>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
