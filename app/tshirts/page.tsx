export const dynamic = "force-dynamic";

import Link from "next/link";
import { getTshirtsShopData } from "@/app/actions";
import { getTshirtsAnalytics } from "@/lib/tshirts-analytics";
import TshirtsPOS from "@/components/tshirts/TshirtsPOS";
import { TshirtsHeader } from "@/components/tshirts/TshirtsHeader";
import { TshirtsSetupBanner } from "@/components/tshirts/TshirtsSetupBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DollarSign, Package, Shirt, TrendingUp } from "lucide-react";
import { TSHIRTS_SHOP_ID, shopAllocationQty } from "@/lib/tshirts";
import type { TeeSetupAlert } from "@/lib/tshirts-setup-alerts";

export default async function TshirtsPage() {
  try {
    const [db, analytics] = await Promise.all([
      getTshirtsShopData(),
      getTshirtsAnalytics(60),
    ]);
    const revenue = db.revenueSummary || { allTime: 0, last60Days: 0, monthToDate: 0 };
    const s = analytics.summary;

    const unitsInStock = (db.inventory || []).reduce(
      (sum: number, item: any) => sum + shopAllocationQty(item, TSHIRTS_SHOP_ID),
      0
    );

    return (
      <div className="space-y-8 pb-32">
        <TshirtsHeader subtitle="POS for Plain T-Shirt and Plain Golf T-Shirt only. Sales, analytics, and reports are separate from your three main shops." />

        <TshirtsSetupBanner alerts={(db as { teeSetupAlerts?: TeeSetupAlert[] }).teeSetupAlerts ?? []} />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            icon={<TrendingUp className="h-3 w-3 text-orange-500" />}
            label="60-day revenue"
            value={`$${revenue.last60Days.toLocaleString()}`}
          />
          <StatCard
            icon={<Shirt className="h-3 w-3 text-orange-400" />}
            label="Plain T-Shirt"
            value={`$${s.plainRevenue60d.toLocaleString()}`}
            hint={`${s.plainUnits60d} units`}
          />
          <StatCard
            icon={<Shirt className="h-3 w-3 text-sky-400" />}
            label="Plain Golf"
            value={`$${s.golfRevenue60d.toLocaleString()}`}
            hint={`${s.golfUnits60d} units`}
          />
          <StatCard
            icon={<Package className="h-3 w-3 text-sky-500" />}
            label="Stock"
            value={`${unitsInStock}`}
            hint="units at tees shop"
          />
          <StatCard
            icon={<DollarSign className="h-3 w-3 text-emerald-500" />}
            label="All-time"
            value={`$${revenue.allTime.toLocaleString()}`}
          />
        </div>

        <p className="text-xs text-slate-500">
          <Link href="/tshirts/analytics" className="text-orange-400 hover:underline font-bold">
            View analytics
          </Link>
          {" · "}
          <Link href="/tshirts/reports" className="text-orange-400 hover:underline font-bold">
            Open reports
          </Link>
          {" · "}
          <Link href="/tshirts/setup-guide" className="text-orange-400 hover:underline font-bold">
            Setup guide
          </Link>
        </p>

        {s.unknownTransactions60d > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
            <strong className="font-black uppercase text-[10px] tracking-widest">Analytics note</strong>
            <p className="mt-1">
              {s.unknownTransactions60d} tee-shop sale(s) in the last 60 days ({`$${s.unknownRevenue60d.toFixed(2)}`}) could
              not be split into Plain vs Plain Golf (usually missing inventory row or non-standard product name). See
              Analytics for detail and fix categories on the SKUs.
            </p>
          </div>
        )}

        <TshirtsPOS inventory={db.inventory} db={db} />
      </div>
    );
  } catch (error: any) {
    console.error("Error rendering TshirtsPage:", error);
    return (
      <div className="space-y-6 max-w-xl mx-auto py-12">
        <Card className="bg-slate-950/80 border-orange-500/30 shadow-2xl">
          <CardHeader className="pb-3 border-b border-orange-500/10">
            <CardTitle className="text-lg font-black uppercase text-orange-500 italic flex items-center gap-2">
              <Shirt className="h-5 w-5 animate-pulse" />
              Nirvana Tees Ecosystem offline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <p className="text-sm text-slate-300">
              The Nirvana Tees portal is currently unable to establish a secure database connection.
            </p>
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs font-mono text-slate-400">
              {error?.message || "Unknown rendering exception"}
            </div>
            <p className="text-xs text-slate-500">
              Please verify your internet connection or database configuration and click reload.
            </p>
            <div className="flex gap-3 pt-2">
              <a
                href="/tshirts"
                className="flex-1 h-10 flex items-center justify-center rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-black uppercase text-white shadow-lg shadow-orange-950/30 cursor-pointer"
              >
                Retry Connection
              </a>
              <Link
                href="/"
                className="flex-1 h-10 flex items-center justify-center rounded-lg border border-slate-850 bg-slate-900 text-xs font-black uppercase text-slate-400 hover:text-slate-200"
              >
                Back to Dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="bg-slate-900/40 border-orange-500/20 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-black font-mono text-white">{value}</div>
        {hint && (
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
