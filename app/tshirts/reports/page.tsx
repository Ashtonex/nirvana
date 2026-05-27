export const dynamic = "force-dynamic";

import { getTshirtsAnalytics } from "@/lib/tshirts-analytics";
import { TshirtsHeader } from "@/components/tshirts/TshirtsHeader";
import { TshirtsReportsClient } from "@/components/tshirts/TshirtsReportsClient";

export default async function TshirtsReportsPage() {
  const data = await getTshirtsAnalytics(365);

  return (
    <div className="space-y-8 pb-32">
      <TshirtsHeader
        title="Tee Reports"
        subtitle="Sale-by-sale ledger for Plain T-Shirt and Plain Golf T-Shirt. Export CSV for your own books."
      />
      <TshirtsReportsClient sales={data.sales} />
    </div>
  );
}
