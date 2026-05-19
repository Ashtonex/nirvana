export const dynamic = "force-dynamic";

import { getTshirtsShopData } from "@/app/actions";
import { getTshirtsAnalytics } from "@/lib/tshirts-analytics";
import { getNirvanaTeesSetupAlerts } from "@/lib/tshirts-setup-alerts";
import { TshirtsSetupBanner } from "@/components/tshirts/TshirtsSetupBanner";
import { TshirtsHeader } from "@/components/tshirts/TshirtsHeader";
import { TshirtsAnalyticsCharts } from "@/components/tshirts/TshirtsAnalyticsCharts";
import TshirtsPredictiveEcosystem from "@/components/tshirts/TshirtsPredictiveEcosystem";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { CreditCard, Package, Shirt, TrendingUp } from "lucide-react";

export default async function TshirtsAnalyticsPage() {
  const [data, setupAlerts, db] = await Promise.all([
    getTshirtsAnalytics(60),
    getNirvanaTeesSetupAlerts(),
    getTshirtsShopData(),
  ]);
  const s = data.summary;

  return (
    <div className="space-y-8 pb-32">
      <TshirtsHeader
        title="Tee Analytics"
        subtitle="Performance for Plain T-Shirt and Plain Golf T-Shirt only — isolated from main shop reports."
      />

      <TshirtsSetupBanner alerts={setupAlerts} />

      {s.unknownTransactions60d > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100">
          <p className="font-black uppercase text-[10px] tracking-widest text-amber-400/90 mb-1">
            Unclassified tee-shop sales (60d)
          </p>
          <p>
            {s.unknownTransactions60d} transaction(s),{" "}
            <span className="font-mono">${s.unknownRevenue60d.toFixed(2)}</span> — not mapped to Plain or Plain Golf.
            Often caused by deleted inventory rows, renamed items without keywords, or legacy categories. Align
            categories with the setup guide and keep stable <code className="text-slate-400">item_id</code> links.
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="h-3 w-3 text-orange-500" />}
          label="Revenue (60d)"
          value={`$${s.revenueLast60Days.toLocaleString()}`}
        />
        <Kpi
          icon={<Shirt className="h-3 w-3 text-orange-400" />}
          label="Plain T-Shirt (60d)"
          value={`$${s.plainRevenue60d.toLocaleString()}`}
          sub={`${s.plainUnits60d} units`}
        />
        <Kpi
          icon={<Shirt className="h-3 w-3 text-sky-400" />}
          label="Plain Golf (60d)"
          value={`$${s.golfRevenue60d.toLocaleString()}`}
          sub={`${s.golfUnits60d} units`}
        />
        <Kpi
          icon={<Package className="h-3 w-3 text-emerald-500" />}
          label="Transactions (60d)"
          value={String(s.transactionCount60d)}
          sub={`${s.unitsLast60Days} units total`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.stockByLine.map((row) => (
          <Card key={row.line} className="bg-slate-900/40 border-orange-500/15">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Stock · {row.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-black font-mono text-white">
                {row.units}{" "}
                <span className="text-sm text-slate-500">units</span>
              </p>
              <p className="text-[10px] text-slate-500 uppercase mt-1">{row.skus} SKUs in stock</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <TshirtsAnalyticsCharts data={data} />

      <TshirtsPredictiveEcosystem data={data} db={db} />

      <Card className="bg-slate-900/40 border-orange-500/15">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Payment mix (60 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-6">
            {data.paymentMix.length === 0 ? (
              <p className="text-slate-500 text-sm">No payments recorded yet.</p>
            ) : (
              data.paymentMix.map((p) => (
                <div key={p.method}>
                  <p className="text-[10px] uppercase font-black text-slate-500">{p.method}</p>
                  <p className="text-lg font-mono text-orange-400">${p.revenue.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{p.count} sales</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="bg-slate-900/40 border-orange-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-black font-mono text-white">{value}</p>
        {sub && (
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

