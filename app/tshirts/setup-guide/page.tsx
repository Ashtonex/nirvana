export const dynamic = "force-dynamic";

import { TEE_CATEGORY_GOLF, TEE_CATEGORY_PLAIN, TSHIRTS_SHOP_ID } from "@/lib/tshirts";
import { TshirtsHeader } from "@/components/tshirts/TshirtsHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default function NirvanaTeesSetupGuidePage() {
  return (
    <div className="space-y-8 pb-32 max-w-3xl">
      <TshirtsHeader title="Setup guide" subtitle="Categories, allocations, and how warnings work." />
      <Card className="border-orange-500/20 bg-slate-900/40">
        <CardHeader>
          <CardTitle className="text-lg">Canonical categories</CardTitle>
          <p className="text-sm text-slate-400">
            Use these exact strings in Supabase <code className="text-orange-300">inventory_items.category</code>:
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-300">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-white">Plain T-Shirt</strong> —{" "}
              <code className="text-emerald-400">{TEE_CATEGORY_PLAIN}</code>
            </li>
            <li>
              <strong className="text-white">Plain Golf T-Shirt</strong> —{" "}
              <code className="text-emerald-400">{TEE_CATEGORY_GOLF}</code>
            </li>
          </ul>
          <p>
            The classifier also accepts close typos (extra spaces, missing hyphen, “Plain Tshirt”). Prefer the exact
            strings so exports and training stay consistent.
          </p>
          <h3 className="text-white font-bold pt-2">What must be true to sell on /tshirts</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Category or product name must classify as plain or golf (see <code className="text-slate-500">lib/tshirts.ts</code>).</li>
            <li>
              <code className="text-slate-500">inventory_allocations</code> must have{" "}
              <code className="text-orange-300">shop_id = &apos;{TSHIRTS_SHOP_ID}&apos;</code> with{" "}
              <code className="text-orange-300">quantity &gt; 0</code>. Master quantity alone is not enough.
            </li>
          </ol>
          <h3 className="text-white font-bold pt-2">Common pitfalls</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-white">Wrong category</strong> — SKU hidden on tee POS; you may see a red alert if
              stock is still allocated to the tee shop.
            </li>
            <li>
              <strong className="text-white">Stock only at other shops</strong> — Allocate units to{" "}
              <code className="text-orange-300">{TSHIRTS_SHOP_ID}</code>.
            </li>
            <li>
              <strong className="text-white">Deleted SKU with historical sales</strong> — Analytics may show
              “Unclassified” for those lines until the inventory row exists again with a matching id.
            </li>
          </ul>
          <h3 className="text-white font-bold pt-2">Where warnings appear</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>Banner on POS, Analytics, and Reports when automated checks find issues.</li>
            <li>
              After <code className="text-slate-500">updateInventoryItem</code> changes <code className="text-slate-500">category</code>, the
              server may return <code className="text-slate-500">nirvanaTeeWarning</code> if stock remains at the tee shop but the new category
              no longer classifies as a tee.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
