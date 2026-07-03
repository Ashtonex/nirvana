export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePrivilegedActor, requireStaffActor } from "@/lib/apiAuth";
import { InvestConsole } from "@/components/InvestConsole";

export default async function InvestPage({ searchParams }: { searchParams: Promise<{ shopId?: string }> }) {
  let actor: any;
  try {
    try {
      actor = await requirePrivilegedActor();
    } catch {
      actor = await requireStaffActor();
    }
  } catch {
    redirect("/login");
  }

  // Ensure role is owner, admin, or manager
  const role = String(actor.type === "owner_cookie" ? "owner" : actor.role).toLowerCase();
  if (role !== "owner" && role !== "admin" && !role.includes("manager")) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  let shopId = resolvedSearchParams.shopId || null;
  if (actor.type === "staff" && actor.shopId) {
    shopId = actor.shopId;
  }

  return (
    <div className="space-y-8 pb-32 pt-8">
      <div className="space-y-2 text-center max-w-4xl mx-auto">
        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-white leading-none">Invest</h1>
        <p className="text-slate-400 font-bold tracking-widest uppercase text-xs italic">
          Perfume Capital Pool & Reinvestments
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        <InvestConsole shopId={shopId} />
      </div>
    </div>
  );
}
