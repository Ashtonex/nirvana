"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { ShoppingCart, Users, AlertCircle, TrendingUp } from "lucide-react";

interface Sale {
  id: string;
  itemName: string;
  quantity: number;
  totalWithTax: number;
  clientName: string;
  time: string;
  shopId: string;
}

interface DashboardMetrics {
  sales: Sale[];
  activeStaffCount: number;
  unreadMessagesCount: number;
  pendingStockRequestsCount: number;
}

export function RealtimeDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    sales: [],
    activeStaffCount: 0,
    unreadMessagesCount: 0,
    pendingStockRequestsCount: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/dashboard/realtime', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (e) {
        console.error('Failed to fetch metrics:', e);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Poll every 3 seconds for updates
    const interval = setInterval(fetchMetrics, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Today's Activity</CardTitle>
          <CardDescription>
            Live sales recorded today
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-10 text-slate-500">Loading...</div>
          ) : metrics.sales.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              No sales recorded yet today
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {metrics.sales.slice(0, 100).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800 hover:border-emerald-500/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <ShoppingCart className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{sale.itemName}</p>
                      <p className="text-xs text-slate-500">{sale.clientName} • {sale.quantity} unit{sale.quantity !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">${sale.totalWithTax.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">{sale.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Live Status</CardTitle>
          <CardDescription>Real-time system metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Staff Online</p>
                <p className="text-lg font-black text-blue-400">{metrics.activeStaffCount}</p>
              </div>
            </div>
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Unread Messages</p>
                <p className="text-lg font-black text-amber-400">{metrics.unreadMessagesCount}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <TrendingUp className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Stock Requests</p>
                <p className="text-lg font-black text-violet-400">{metrics.pendingStockRequestsCount}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
