export const dynamic = "force-dynamic";

import { getTshirtsAnalytics } from "@/lib/tshirts-analytics";
import { getNirvanaTeesSetupAlerts } from "@/lib/tshirts-setup-alerts";
import { TshirtsSetupBanner } from "@/components/tshirts/TshirtsSetupBanner";
import { TshirtsHeader } from "@/components/tshirts/TshirtsHeader";
import { TshirtsReportsClient } from "@/components/tshirts/TshirtsReportsClient";

export default async function TshirtsReportsPage() {
  const [data, setupAlerts] = await Promise.all([
    getTshirtsAnalytics(365),
    getNirvanaTeesSetupAlerts(),
  ]);

  return (
    <div className="space-y-8 pb-32">
      <TshirtsHeader
        title="Tee Reports"
        subtitle="Sale-by-sale ledger for Plain T-Shirt and Plain Golf T-Shirt. Export CSV for your own books."
      />
      <TshirtsSetupBanner alerts={setupAlerts} />
      <TshirtsReportsClient sales={data.sales} />
    </div>
  );
}
