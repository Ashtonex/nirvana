"use client";

import { useMemo, useState } from "react";
import { PeriodSelector, Period } from "@/app/admin/tax/PeriodSelector";
import { Button } from "@/components/ui";
import { Download } from "lucide-react";
import { exportTshirtsReportCSV } from "@/app/actions";
import type { TshirtsAnalytics } from "@/lib/tshirts-analytics";

type LineFilter = "all" | "plain" | "golf";

export function TshirtsReportsClient({ sales }: { sales: TshirtsAnalytics["sales"] }) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [isLoadingCSV, setIsLoadingCSV] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePeriodChange = (_period: Period, newStart?: Date, newEnd?: Date) => {
    setStartDate(newStart);
    setEndDate(newEnd);
  };

  const filtered = useMemo(() => {
    return sales.filter((sale) => {
      if (lineFilter !== "all" && sale.line !== lineFilter) return false;
      if (!startDate || !endDate) return true;
      const d = new Date(sale.date);
      return d >= startDate && d <= endDate;
    });
  }, [sales, startDate, endDate, lineFilter]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.totalWithTax, 0);
    const units = filtered.reduce((s, r) => s + r.quantity, 0);
    const plain = filtered.filter((s) => s.line === "plain");
    const golf = filtered.filter((s) => s.line === "golf");
    return {
      revenue,
      units,
      count: filtered.length,
      plainRevenue: plain.reduce((s, r) => s + r.totalWithTax, 0),
      golfRevenue: golf.reduce((s, r) => s + r.totalWithTax, 0),
    };
  }, [filtered]);

  const handleExport = async () => {
    try {
      setIsLoadingCSV(true);
      setError(null);
      const result = await exportTshirtsReportCSV(
        filtered.map((s) => ({
          date: s.date,
          itemName: s.itemName,
          lineLabel: s.lineLabel,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          totalWithTax: s.totalWithTax,
          paymentMethod: s.paymentMethod,
          clientName: s.clientName,
        }))
      );
      if (!result.success || !result.data || !result.filename) {
        setError(result.error || "Export failed");
        return;
      }
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Export failed");
    } finally {
      setIsLoadingCSV(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <PeriodSelector onPeriodChange={handlePeriodChange} />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All lines"],
              ["plain", "Plain T-Shirt"],
              ["golf", "Plain Golf T-Shirt"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant={lineFilter === key ? "default" : "outline"}
              className={
                lineFilter === key
                  ? "bg-orange-600 hover:bg-orange-500 text-[10px] font-black uppercase"
                  : "text-[10px] font-black uppercase border-slate-700"
              }
              onClick={() => setLineFilter(key)}
            >
              {label}
            </Button>
          ))}
          <Button
            onClick={handleExport}
            disabled={isLoadingCSV || filtered.length === 0}
            className="text-[10px] font-black uppercase bg-slate-800 border border-slate-700"
          >
            <Download className="h-4 w-4 mr-1" />
            {isLoadingCSV ? "Exporting…" : "CSV"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Transactions" value={String(totals.count)} />
        <SummaryCard label="Units sold" value={String(totals.units)} />
        <SummaryCard label="Plain T-Shirt $" value={`$${totals.plainRevenue.toFixed(2)}`} />
        <SummaryCard label="Plain Golf $" value={`$${totals.golfRevenue.toFixed(2)}`} />
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-orange-500/15">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-500 uppercase bg-slate-900/80">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Product line</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  No tee sales in this period.
                </td>
              </tr>
            ) : (
              filtered.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(sale.date).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        sale.line === "golf"
                          ? "text-sky-400 text-[10px] font-black uppercase"
                          : "text-orange-400 text-[10px] font-black uppercase"
                      }
                    >
                      {sale.lineLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100">{sale.itemName}</td>
                  <td className="px-4 py-3">{sale.quantity}</td>
                  <td className="px-4 py-3 font-mono">${sale.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400 font-bold">
                    ${sale.totalWithTax.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-400">{sale.paymentMethod}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-orange-950/30 font-black">
                <td colSpan={5} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest text-slate-400">
                  Period total
                </td>
                <td className="px-4 py-3 font-mono text-orange-400">
                  ${totals.revenue.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-orange-500/15 bg-slate-900/50 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-lg font-black font-mono text-white mt-1">{value}</p>
    </div>
  );
}
